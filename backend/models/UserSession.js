// backend/models/UserSession.js
const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  certificateUrl: {
    type: String,
    default: null
  },
  certificateFile: {
    type: String,
    default: null
  },
  logsUrl: {
    type: String,
    default: null
  },
  logsFile: {
    type: String,
    default: null
  },
  filesWiped: {
    type: Number,
    default: 0
  },
  directoriesWiped: {
    type: Number,
    default: 0
  },
  totalSize: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    default: 'unknown'
  },
  paths: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  collection: 'usersessions'
});

// Update timestamp before save
userSessionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Create indexes for faster queries
userSessionSchema.index({ username: 1, createdAt: -1 });
userSessionSchema.index({ sessionId: 1, username: 1 });

module.exports = mongoose.model('UserSession', userSessionSchema);