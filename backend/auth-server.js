const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());

// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/securewipe?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB Atlas connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['individual', 'organization-ceo', 'organization-employee'],
    required: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  }
});

// Note: Mongoose will create a unique index from the schema definition

// Session Schema for tracking active sessions
const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  token: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Session expires after 24 hours
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
});

// Organization Schema (for org users)
const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  managerCount: {
    type: Number,
    default: 0
  },
  employeeCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Models
const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);
const Organization = mongoose.model('Organization', organizationSchema);

// Drop legacy email index if it exists (prevents duplicate-key on email:null)
User.collection.dropIndex('email_1').catch(() => {
  // index might not exist; ignore
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper function to generate token
const generateToken = (userId, username, role) => {
  return jwt.sign(
    { userId, username, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Helper function to generate session ID
const generateSessionId = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// Check if username exists
const checkUsernameExists = async (username) => {
  const user = await User.findOne({ username: username });
  return !!user;
};

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    // Validate input
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, and role are required' });
    }
    
    // Validate role
    const validRoles = ['individual', 'organization-ceo', 'organization-employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be individual, organization-ceo, or organization-employee' });
    }
    
    // Check if username already exists
    if (await checkUsernameExists(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = new User({
      username: username,
      password: hashedPassword,
      role: role
    });
    
    // If organization CEO, create organization
    if (role === 'organization-ceo') {
      const organization = new Organization({
        name: `${username}'s Organization`,
        createdBy: user._id
      });
      await organization.save();
      user.organizationId = organization._id;
    }
    
    await user.save();
    
    // Generate token
    const token = generateToken(user._id, user.username, user.role);
    const sessionId = generateSessionId();
    
    // Create session
    const session = new Session({
      userId: user._id,
      sessionId: sessionId,
      token: token
    });
    await session.save();
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      sessionId,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        organizationId: user.organizationId
      }
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user
    const user = await User.findOne({ username: username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token and session ID
    const token = generateToken(user._id, user.username, user.role);
    const sessionId = generateSessionId();
    
    // Create or update session
    await Session.findOneAndDelete({ userId: user._id }); // Remove old session if exists
    const session = new Session({
      userId: user._id,
      sessionId: sessionId,
      token: token
    });
    await session.save();
    
    res.json({
      message: 'Login successful',
      token,
      sessionId,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        organizationId: user.organizationId
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Verify token endpoint
app.post('/api/auth/verify', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      valid: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        organizationId: user.organizationId
      }
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate session endpoint
app.post('/api/auth/validate-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const session = await Session.findOne({ sessionId }).populate('userId', 'username role organizationId');
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    // Update last active
    session.lastActive = new Date();
    await session.save();
    
    res.json({
      valid: true,
      user: {
        id: session.userId._id,
        username: session.userId.username,
        role: session.userId.role,
        organizationId: session.userId.organizationId
      }
    });
    
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
app.get('/api/auth/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password')
      .populate('organizationId', 'name');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
    
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update last active
app.post('/api/auth/keep-alive', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, {
      lastActive: new Date()
    });
    
    res.json({ message: 'Session kept alive' });
    
  } catch (error) {
    console.error('Keep-alive error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    // Delete session from database
    if (sessionId) {
      await Session.findOneAndDelete({ sessionId });
    }
    
    res.json({ message: 'Logout successful' });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Get all users (protected)
app.get('/api/auth/users', verifyToken, async (req, res) => {
  try {
    // Only allow managers to view users
    if (!req.user.role.includes('manager')) {
      return res.status(403).json({ error: 'Access denied. Manager role required.' });
    }
    
    const users = await User.find({ organizationId: req.user.organizationId })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(users);
    
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/api/auth/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mongoConnected: mongoose.connection.readyState === 1
  });
});

const PORT = process.env.AUTH_PORT || 5001;
app.listen(PORT, () => {
  console.log(`🔐 Auth server running on port ${PORT}`);
});