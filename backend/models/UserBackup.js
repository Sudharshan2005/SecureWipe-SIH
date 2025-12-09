// backend/models/UserBackup.js
const mongoose = require('mongoose');

const userBackupSchema = new mongoose.Schema({
  username: String,
  sessionId: String,
  backupUrls: [String],
  access: [String],
}, { timestamps: true });

// Use exact collection name
module.exports = mongoose.model('UserBackup', userBackupSchema, 'userbackups');