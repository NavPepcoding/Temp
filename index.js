const express = require("express");
const users = require("./models/users");
const app = express();
const server = require("http").createServer(app);
const REDIS_PORT = process.env.REDIS_PORT || 2100;
const redis = require('redis')
require("dotenv/config");

const rdClient = redis.createClient(REDIS_PORT)

const io = require("socket.io")(server, {
  cors: {
    orign: "*",
  },
});
const PORT = process.env.PORT || 2000;
const mongoose = require("mongoose");
const messages = require("./models/messages");
const rooms = require("./models/rooms");
const cors = require("cors");

function updateCachedRoomMessages(roomID, recentData){
  const preCached = rdClient.get(`messages:${roomID}`);
  if(preCached){
    const data = JSON.parse(preCached);
    data.push(recentData);
    rdClient.setex(`messages:${roomID}`, 600, JSON.stringify(data));
  } else {
    // fetch messages from database and update cache as there is no pre-exisiting cache
    setCacheRoomMessages(roomID)
  }
}


function setCacheRoomMessages(roomID){
  try {
    messages
      .find({ roomID })
      .sort({ createdAt: 1 })
      .exec(function (err, docs) {
        if (err) {
          return res.sendStatus(500);
        }
        // caching messages of roomID as messages:{roomID}
        rdClient.setex(`messages:${roomID}`, 600, JSON.stringify(docs));
        return res.json(docs);
      });
  } catch (err) {
    res.sendStatus(500);
  }
}

io.on("connection", (socket) => {
  socket.on("join", (joinerID) => {
    rooms
      .find({ $or: [{ p1: joinerID }, { p2: joinerID }] })
      .then(async (rooms) => {
        rooms.map((room) => {
          socket.join(JSON.stringify(room._id));
        });
      });
  });

  socket.on("send-message", async (data) => {
    try {
      const { from, msg, roomID } = data;
      const roomDoc = await rooms.findById(roomID);
      let { read, p1, p2 } = roomDoc;

      const to = p1.equals(mongoose.Types.ObjectId(from)) ? p2 : p1;
      socket.to(JSON.stringify(roomID)).emit("get-message", { ...data, to });
      let newMessage = new messages({
        roomID,
        from,
        to,
        msg,
      });
      newMessage.save();

      // updating cache for new message after saving it to DB
      updateCachedRoomMessages(roomID, newMessage);

      read = {
        p1: mongoose.Types.ObjectId(from).equals(p1),
        p2: mongoose.Types.ObjectId(from).equals(p2),
      };
      await rooms.findOneAndUpdate(
        { _id: roomID },
        {
          read,
        }
      );
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("update-read", async (data) => {
    try {
      const { roomID, user } = data;
      const room = await rooms.findById(data.roomID);
      let { p1, read } = room;
      if (mongoose.Types.ObjectId(user).equals(p1))
        read = { ...read, p1: true };
      else read = { ...read, p2: true };
      await rooms.findOneAndUpdate(
        {
          _id: roomID,
        },
        {
          read,
        },
        {
          timestamps: false,
        }
      );
    } catch (err) {
      console.log(err);
    }
  });
});

app.use(cors());
mongoose
  .connect(process.env.MONGO_DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    ignoreUndefined: true,
    useFindAndModify: false,
  })
  .then(() => {
    console.log("DB connected");
  })
  .catch(console.error);

app.use(express.json());

app.post("/user/create", async function (req, res) {
  try {
    const { email } = req.body;
    if (!email || email.length === 0)
      return res.status(500).json("invalid email");
    const user = await users.findOne({ email: req.body.email });
    if (!user) {
      const newUser = new users({
        email: req.body.email,
      });
       newUser.save();
      const userId = newUser._id;

      const usersDetails = await users.find().where("email").ne(req.body.email);

      for (let user of usersDetails) {
        const newRoom = new rooms({
          p1: mongoose.Types.ObjectId(userId),
          p2: mongoose.Types.ObjectId(user._id),
        });
        await newRoom.save();
        console.log(newRoom._id);
      }
      console.log("emitting");
      io.emit("user-created", newUser);
      res.json(newUser);
    } else {
      res.json(user);
    }
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/users/:id", async function (req, res) {
  try {
    const currUserId = req.params.id;
    const roomList = await rooms
      .find({ $or: [{ p1: currUserId }, { p2: currUserId }] })
      .sort({ updatedAt: -1 });
    const roomArrPromise = roomList.map(async (room) => {
      const getUserToSendMessage = await users
        .findOne()
        .where("_id")
        .equals(room.p1 == currUserId ? room.p2 : room.p1);
      return {
        roomID: room._id,
        email: getUserToSendMessage.email,
        read: room.p1 == currUserId ? room.read.p1 : room.read.p2,
        _id: getUserToSendMessage._id,
        updatedAt: room.updatedAt,
      };
    });
    const roomArr = await Promise.all(roomArrPromise);
    res.json(roomArr);
  } catch (err) {
    res.sendStatus(500);
  }
});

function getCachedRoomMessages(res, req, next){
  try {
    const { roomID } = req.params;
    
    if(!roomID) throw new Error("Invalid roomID.");

    rdClient.get(`messages:${roomID}`, function(err, cachedMessages){

      if(err) throw err;
      
      if(cachedMessages === null){
        next();
      } else {
        res.json(JSON.parse(cachedMessages))
      }

    })
  } catch (error) {
    console.error(error)
    res.sendStatus(500)
  }

}

app.get("/message/:roomID", getCachedRoomMessages, function (req, res) {
  try {
    const { roomID } = req.params;
    messages
      .find({ roomID })
      .sort({ createdAt: 1 })
      .exec(function (err, docs) {
        if (err) {
          return res.sendStatus(500);
        }

        // caching messages of roomID as messages:{roomID}
        rdClient.setex(`messages:${roomID}`, 600, JSON.stringify(docs));
        return res.json(docs);
      });
  } catch (err) {
    res.sendStatus(500);
  }
});

server.listen(PORT, () => {
  console.log(`listening at http://localhost:${PORT}`);
});
