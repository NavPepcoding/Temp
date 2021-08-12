const Schema = require('mongoose').Schema;
const mongoose = require('mongoose')

const RoomSchema = new Schema({
    p1: {
        type: Schema.Types.ObjectId,
        ref: 'Users'
    },
    p2: {
        type: Schema.Types.ObjectId,
        ref: 'Users'
    },
    read : {
        type : Schema.Types.Mixed,
        default : {
            p1 : true,
            p2 : true
        }
    }
},    {timestamps: { createdAt: true, updatedAt: true }}
)

module.exports = mongoose.model('Rooms', RoomSchema)
