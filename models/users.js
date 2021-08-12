const Schema = require('mongoose').Schema;
const mongoose = require('mongoose')

const UserSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique : true
    },
    createdAt: {
        type: Date,
        default: Date.now()
    }
})

module.exports = mongoose.model('Users', UserSchema)