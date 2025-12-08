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
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['individual', 'organization-manager', 'organization-employee'],
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
const Organization = mongoose.model('Organization', organizationSchema);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper function to generate token
const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
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

// Check if email exists
const checkEmailExists = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  return !!user;
};

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    // Validate input
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }
    
    // Validate role
    const validRoles = ['individual', 'organization-manager', 'organization-employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be individual, organization-manager, or organization-employee' });
    }
    
    // Check if email already exists
    if (await checkEmailExists(email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role
    });
    
    // If organization manager, create organization
    if (role === 'organization-manager') {
      const organization = new Organization({
        name: `${email.split('@')[0]}'s Organization`,
        createdBy: user._id
      });
      await organization.save();
      user.organizationId = organization._id;
    }
    
    await user.save();
    
    // Generate token
    const token = generateToken(user._id, user.email, user.role);
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
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
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token
    const token = generateToken(user._id, user.email, user.role);
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
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
        email: user.email,
        role: user.role,
        organizationId: user.organizationId
      }
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
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
    // Note: For JWT, logout is handled client-side by removing the token
    // This endpoint can be used for server-side cleanup if needed
    
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