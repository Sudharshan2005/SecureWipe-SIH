// backend/models/UserSession.js
const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema({
  username: String,
  sessionId: String,
  certificate: String,
  logs: String,
}, { timestamps: true });

// Use exact collection name
module.exports = mongoose.model('UserSession', userSessionSchema, 'usersessions');