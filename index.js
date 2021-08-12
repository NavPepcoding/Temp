const express = require('express')
const users = require('./models/users')
const app = express()
const server = require('http').createServer(app)
require('dotenv/config')

const io = require('socket.io')(server, {
    cors: {
        orign: "*"
    }
})
const PORT = process.env.PORT || 2000
const mongoose = require('mongoose')
const messages = require('./models/messages')
const rooms = require('./models/rooms')
const cors = require('cors')

io.on('connection', (socket) => {
    socket.on('join', (joinerID) => {
        rooms.find({ $or: [{ p1: joinerID }, { p2: joinerID }] }).then(async (rooms) => {
            rooms.map(room => {
                socket.join(JSON.stringify(room._id));
            })
        })
    })

    socket.on('send-message', async (data) => {
        try {
            const { from, msg, roomID } = data;
            const roomDoc = await rooms.findById(roomID)
            let { read, p1, p2 } = roomDoc;

            const to = p1.equals(mongoose.Types.ObjectId(from)) ? p2 : p1;
            let newMessage = new messages({
                roomID,
                from,
                to,
                msg
            })
            newMessage.save();
            read = {
                p1: mongoose.Types.ObjectId(from).equals(p1),
                p2: mongoose.Types.ObjectId(from).equals(p2),
            }
            await rooms.findOneAndUpdate({ _id: roomID }, {
                read
            })
            socket.to(JSON.stringify(roomID)).emit('get-message', { ...data, to })
        }
        catch (err) {
            console.log(err)
        }
    })

    socket.on('update-read', async (data) => {
        try {
            const { roomID, user } = data
            const room = await rooms.findById(data.roomID);
            let { p1, read } = room;
            if (mongoose.Types.ObjectId(user).equals(p1))
                read = { ...read, p1: true };
            else read = { ...read, p2: true }
            await rooms.findOneAndUpdate({
                _id: roomID
            }, {
                read
            },{
                timestamps : false
            })
        }
        catch (err) {
            console.log(err)
        }
    })

})

app.use(cors())
mongoose.connect(process.env.MONGO_DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    ignoreUndefined: true,
    useFindAndModify: false
})
    .then(() => {
        console.log("DB connected")
    })
    .catch(console.error)


app.use(express.json())


app.post("/user/create", async function (req, res) {
    try {
        const { email } = req.body
        if (!email || email.length === 0)
            return res.status(500).json("invalid email")
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
    }
    catch (err) {
        res.sendStatus(500)
    }

})
app.get('/users/:id', async function (req, res) {
    try {
        const currUserId = req.params.id;
        const roomList = await rooms.find({ $or: [{ p1: currUserId }, { p2: currUserId }] }).sort({ updatedAt: -1 })
        const roomArrPromise = roomList.map(async (room) => {
            return {
                roomID: room._id,
                email: (await users.findOne().where("_id").equals(room.p1 == currUserId ? room.p2 : room.p1)).email,
                read: room.p1 == currUserId ? room.read.p1 : room.read.p2,
                _id: (await users.findOne().where("_id").equals(room.p1 == currUserId ? room.p2 : room.p1))._id,
                updatedAt: room.updatedAt
            }
        })
        const roomArr = await Promise.all(roomArrPromise)
        const unread = roomArr.filter(room => room.read === false)
       unread.sort((a,b) => a.updatedAt>b.updatedAt)
       const readRooms = roomArr.filter(room=>room.read === true);
       readRooms.sort((a,b) => a.updatedAt>b.updatedAt)
        res.json([...unread,...readRooms])
    }
    catch (err) {
        res.sendStatus(500)
    }

})


app.get("/message/:roomID", function (req, res) {
    try {
        const { roomID } = req.params
        messages
            .find({ roomID })
            .sort({ createdAt: 1 })
            .exec(function (err, docs) {
                if (err) {
                    return res.sendStatus(500)
                }
                return res.json(docs);
            })
    }
    catch (err) {
        res.sendStatus(500)
    }
})

server.listen(PORT, () => {
    console.log(`listening at http://localhost:${PORT}`)
})