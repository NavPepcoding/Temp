const express = require('express')
const users = require('./models/users')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server, {
    cors: {
        orign: "*"
    }
})
const PORT = process.env.PORT || 2000
require('dotenv/config')
const mongoose = require('mongoose')
const messages = require('./models/messages')
const rooms = require('./models/rooms')
const cors = require('cors')

io.on('connection', (socket) => {
    socket.on('join', () => {
        rooms.find().then(rooms => {
            rooms.forEach((room) => {
                socket.join(room._id)
            })
        })
    })

    socket.on('send-message', async (data) => {
        const { from, to, msg, roomID } = data;

        let newMessage = new messages({
            roomID,
            from,
            to,
            msg
        })
        newMessage.save();
        const room = await rooms.findById(roomID);
        let { read, p1, p2 } = room;
        read = {
            p1: mongoose.Types.ObjectId(from).equals(p1),
            p2: mongoose.Types.ObjectId(from).equals(p2),
        }
        await rooms.findOneAndUpdate({ _id: roomID }, {
            read
        })
        socket.broadcast.to(roomID).emit('get-message', data)
    })

})

app.use(cors())
mongoose.connect(process.env.MONGO_DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    ignoreUndefined: true
})
    .then(() => {
        console.log("mongoose connected")
    })
    .catch(console.error)


app.use(express.json())

app.get("/", (req, res) => {
    res.sendFile(__dirname + '/public/index.html')
})

app.post("/user/create", async function (req, res) {
    const user = await users.findOne({ email: req.body.email })
    if (!user) {
        const newUser = new users({
            email: req.body.email
        })
        newUser.save();
        const userId = newUser._id;


        users.find().where("email").ne(req.body.email).then(users => {
            users.forEach(user => {
                const newRoom = new rooms({
                    p1: mongoose.Types.ObjectId(userId),
                    p2: mongoose.Types.ObjectId(user._id)
                })
                newRoom.save()
            })
        })
        res.json(newUser)
    } else {
        res.json(user);
    }

})
app.get('/users/:id', async function (req, res) {
    const currUserId = req.params.id;

    const roomList = await rooms.find({ $or: [{ p1: currUserId }, { p2: currUserId }] }).sort({ updatedAt: -1 })
    const roomArrPromise = roomList.map(async (room) => {
        return {
            roomId: room._id,
            email: (await users.findOne().where("_id").equals(room.p1 == currUserId ? room.p2 : room.p1)).email,
            read: room.p1 == currUserId ? room.read.p1 : room.read.p2,
            updatedAt: room.updatedAt
        }
    })
    const roomArr = await Promise.all(roomArrPromise)
    res.json(roomArr)

})


app.get("/message/:roomID", function (req, res) {
    // find room id using p1 and p2
    const { roomID } = req.params
    messages
        .find({ roomID })
        .sort({ createdAt: 1 })
        .exec(function (err, docs) {
            if (err) {
                console.error(err)
                return res.sendStatus(500)
            }
            return res.json(docs);
        })
})

server.listen(PORT, () => {
    console.log(`listening at http://localhost:${PORT}`)
})