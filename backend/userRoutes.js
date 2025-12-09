const express = require('express');
const router = express.Router();
const UserSession = require('../models/UserSession');
const UserBackup = require('../models/UserBackup');

// Get user sessions
router.get('/api/user/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }

    // Find sessions where user is the owner OR has access
    const sessions = await UserSession.find({
      $or: [
        { username: username },
        // If you add access field to UserSession schema:
        // { access: username }
      ]
    }).sort({ createdAt: -1 }); // Sort by newest first

    // If you want to also include sessions from backups where user has access
    const backupSessions = await UserBackup.find({
      access: username,
      username: { $ne: username } // Exclude user's own backups
    }).select('sessionId username createdAt');

    // Merge results
    const allSessions = [...sessions.map(s => ({
      ...s.toObject(),
      type: 'session'
    }))];

    res.json({
      success: true,
      sessions: allSessions,
      count: allSessions.length
    });

  } catch (error) {
    console.error('Error fetching user sessions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user sessions',
      details: error.message 
    });
  }
});

// Get user backups
router.get('/api/user/backups', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }

    // Find backups where user is the owner OR has access
    const backups = await UserBackup.find({
      $or: [
        { username: username },
        { access: username }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      backups: backups,
      count: backups.length
    });

  } catch (error) {
    console.error('Error fetching user backups:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user backups',
      details: error.message 
    });
  }
});

// Get combined dashboard data
router.get('/api/user/dashboard', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }

    // Fetch sessions and backups in parallel
    const [sessions, backups] = await Promise.all([
      UserSession.find({
        $or: [
          { username: username },
          // { access: username } // if you add access to UserSession
        ]
      }).sort({ createdAt: -1 }),
      
      UserBackup.find({
        $or: [
          { username: username },
          { access: username }
        ]
      }).sort({ createdAt: -1 })
    ]);

    // Calculate statistics
    const stats = {
      totalSessions: sessions.length,
      totalBackups: backups.length,
      totalFilesBackedUp: backups.reduce((sum, backup) => 
        sum + (backup.backupUrls?.length || 0), 0
      ),
      // Add more stats as needed
    };

    res.json({
      success: true,
      username,
      stats,
      sessions: sessions,
      backups: backups,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard data',
      details: error.message 
    });
  }
});

// Get specific session with details (for modal view)
router.get('/api/user/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }

    // Find session
    const session = await UserSession.findOne({
      sessionId,
      $or: [
        { username: username },
        // { access: username }
      ]
    });

    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found or access denied' 
      });
    }

    // Find related backup if exists
    const backup = await UserBackup.findOne({
      sessionId,
      $or: [
        { username: username },
        { access: username }
      ]
    });

    res.json({
      success: true,
      session: {
        ...session.toObject(),
        relatedBackup: backup || null
      }
    });

  } catch (error) {
    console.error('Error fetching session details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch session details',
      details: error.message 
    });
  }
});

// Get all users with access to a session (for access management)
router.get('/api/user/session/:sessionId/access', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { username } = req.query;

    // Verify user has access
    const userBackup = await UserBackup.findOne({
      sessionId,
      $or: [
        { username: username },
        { access: username }
      ]
    });

    if (!userBackup) {
      return res.status(403).json({ 
        error: 'Access denied to this session' 
      });
    }

    // Get all users with access to this session
    const allBackupsForSession = await UserBackup.find({ sessionId });
    
    const usersWithAccess = new Set();
    allBackupsForSession.forEach(backup => {
      usersWithAccess.add(backup.username);
      if (backup.access && Array.isArray(backup.access)) {
        backup.access.forEach(user => usersWithAccess.add(user));
      }
    });

    res.json({
      success: true,
      sessionId,
      users: Array.from(usersWithAccess),
      count: usersWithAccess.size
    });

  } catch (error) {
    console.error('Error fetching session access:', error);
    res.status(500).json({ 
      error: 'Failed to fetch session access',
      details: error.message 
    });
  }
});

// Share session with other users
router.post('/api/user/session/:sessionId/share', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { username, usersToShare } = req.body;

    if (!username || !usersToShare || !Array.isArray(usersToShare)) {
      return res.status(400).json({ 
        error: 'Username and usersToShare array are required' 
      });
    }

    // Find user's backup for this session
    const userBackup = await UserBackup.findOne({
      sessionId,
      username: username
    });

    if (!userBackup) {
      return res.status(403).json({ 
        error: 'You do not own this session' 
      });
    }

    // Update access list
    const newAccess = [...new Set([...userBackup.access, ...usersToShare])];
    userBackup.access = newAccess;
    await userBackup.save();

    res.json({
      success: true,
      message: `Session shared with ${usersToShare.length} user(s)`,
      sessionId,
      access: userBackup.access,
      updatedAt: userBackup.updatedAt
    });

  } catch (error) {
    console.error('Error sharing session:', error);
    res.status(500).json({ 
      error: 'Failed to share session',
      details: error.message 
    });
  }
});

module.exports = router;