const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  sequence: {
    type: Number,
    required: true,
    min: 0
  }
}, { versionKey: false });

module.exports = mongoose.model('Counter', counterSchema);
