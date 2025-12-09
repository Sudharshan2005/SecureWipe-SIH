// backend/memory-store.js
class MemoryStore {
  constructor() {
    this.userSessions = new Map();
    this.userBackups = new Map();
  }

  async saveUserSession(session) {
    const sessionData = {
      ...session,
      _id: session.sessionId,
      createdAt: session.createdAt || new Date(),
      updatedAt: new Date()
    };
    
    this.userSessions.set(session.sessionId, sessionData);
    return sessionData;
  }

  async getUserSessions(username) {
    return Array.from(this.userSessions.values())
      .filter(session => session.username === username)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async saveUserBackup(backup) {
    const backupData = {
      ...backup,
      _id: backup.sessionId,
      createdAt: backup.createdAt || new Date(),
      updatedAt: new Date()
    };
    
    this.userBackups.set(backup.sessionId, backupData);
    return backupData;
  }

  async getUserBackups(username) {
    return Array.from(this.userBackups.values())
      .filter(backup => 
        backup.username === username || 
        (backup.access && backup.access.includes(username))
      )
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async shareSession(sessionId, ownerUsername, usersToShare) {
    const backup = await this.getUserBackup(sessionId);
    if (!backup || backup.username !== ownerUsername) {
      return null;
    }

    const newAccess = [...new Set([...(backup.access || []), ...usersToShare])];
    backup.access = newAccess;
    backup.updatedAt = new Date();
    
    this.userBackups.set(sessionId, backup);
    return backup;
  }
}

module.exports = new MemoryStore();