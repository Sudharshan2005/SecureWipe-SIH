const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function dropEmailIndex() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Drop the email index from users collection
    try {
      await db.collection('users').dropIndex('email_1');
      console.log('✅ Dropped email_1 index from users collection');
    } catch (error) {
      console.log('ℹ️  email_1 index does not exist or already dropped');
    }

    // Optional: Drop all existing data to start fresh
    const clearData = process.argv.includes('--clear');
    if (clearData) {
      await db.collection('users').deleteMany({});
      await db.collection('sessions').deleteMany({});
      await db.collection('organizations').deleteMany({});
      console.log('✅ Cleared all data from users, sessions, and organizations collections');
    }

    console.log('✅ Database cleanup complete!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

dropEmailIndex();
