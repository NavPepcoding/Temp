const Schema = require('mongoose').Schema;
const mongoose = require('mongoose')

const MessageSchema = new Schema({
    roomID: {
        type: Schema.Types.ObjectId,
        ref: 'Rooms'
    },
    from: {
        type: Schema.Types.ObjectId,
        ref: 'Users'
    },
    to: {
        type: Schema.Types.ObjectId,
        ref: 'Users'
    },
    msg: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now()
    }
})

module.exports = mongoose.model('Messages', MessageSchema)