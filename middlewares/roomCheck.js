const mongoose = require("mongoose");
const rooms = require("../models/rooms");

function roomCheck(req, res, next){
    const { p1, p2 } = req.body 

    rooms.findOne({
        p1,
        p2
    })
    .then(result => {
        if(result){
            console.log("pre-exisiting room")
            const roomID = result._id
            res.locals.roomID = roomID
        } else {
            const newRoom = new rooms({
                p1: mongoose.Types.ObjectId(p1),
                p2: mongoose.Types.ObjectId(p2)
            })
            newRoom.save();
            console.log("new room created.")
            res.locals.roomID = newRoom._id;
        }

        next()
    })
    .catch(console.error)
}

module.exports = roomCheck;