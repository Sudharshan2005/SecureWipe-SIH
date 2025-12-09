const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const winston = require('winston');
const os = require('os');
const s3Service = require('./s3-service');
const multer = require('multer');
const { connectDB } = require('./db');
const UserSession = require('./models/UserSession');
const UserBackup = require('./models/UserBackup');
const memoryStore = require('./memory-store');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 6000;

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'securewipe-backend' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Configuration
const BASE_DIRECTORY = process.env.BASE_PATH || '/Users/sudharshan/Documents/sih';
const ALLOWED_PATHS = ['/Users/sudharshan/Documents/sih'];
const SESSIONS_DIR = path.join(__dirname, 'sessions');

// Ensure sessions directory exists
fs.ensureDirSync(SESSIONS_DIR);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:5000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'http://localhost:6000',
    'http://127.0.0.1:6000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400 // 24 hours
}));

connectDB();

app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 1024 * 1024 * 100, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// Store wipe sessions
const wipeSessions = new Map();
const completedNotifications = new Set();

// Secure wipe patterns
const WIPE_PATTERNS = [
  Buffer.from([0x00]),
  Buffer.from([0xFF]),
  Buffer.from([0xAA]),
  Buffer.from([0x55]),
  Buffer.from([0x92, 0x49, 0x24]),
  Buffer.from([0x49, 0x24, 0x92]),
  Buffer.from([0x24, 0x92, 0x49]),
];

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes /  Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function saveSessionToFile(sessionId, session) {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    const sessionToSave = {
      ...session,
      savedAt: new Date().toISOString(),
      fromFile: true
    };
    
    const cleanSession = JSON.parse(JSON.stringify(sessionToSave, (key, value) => {
      if (value instanceof Buffer) {
        return value.toString('base64');
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'function') {
        return undefined;
      }
      if (value === undefined) {
        return null;
      }
      return value;
    }));
    
    const tempFilePath = filePath + '.tmp';
    await fs.writeFile(tempFilePath, JSON.stringify(cleanSession, null, 2), 'utf8');
    
    await fs.rename(tempFilePath, filePath);
    
    logger.info(`Session ${sessionId} saved to file`);
    return true;
  } catch (error) {
    logger.error(`Failed to save session ${sessionId} to file:`, error);
    return false;
  }
}

async function loadSessionFromFile(sessionId) {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (!(await fs.pathExists(filePath))) {
      return null;
    }
    
    const fileContent = await fs.readFile(filePath, 'utf8');
    
    let cleanContent = fileContent.trim();
    cleanContent = cleanContent.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    
    const session = JSON.parse(cleanContent, (key, value) => {
      if (key === 'startTime' || key === 'endTime' || key === 'lastAccessed' || key === 'savedAt') {
        return value ? new Date(value) : null;
      }
      return value;
    });
    
    session.from = 'file storage';
    session.lastAccessed = new Date();
    
    if (!session.id || !session.status) {
      logger.warn(`Invalid session data in file: ${sessionId}`);
      return null;
    }
    
    return session;
  } catch (error) {
    logger.error(`Failed to load session ${sessionId} from file:`, error.message);
    return null;
  }
}

function validateAndSanitizePath(userPath) {
  try {
    const cleanPath = userPath.trim();
    
    if (!cleanPath) {
      throw new Error('Empty path');
    }
    
    let normalizedPath = path.normalize(cleanPath);
    normalizedPath = normalizedPath.replace(/^\.\/|^\.\\/, '');
    
    if (normalizedPath.includes('..')) {
      throw new Error('Path traversal not allowed');
    }
    
    if (path.isAbsolute(normalizedPath)) {
      throw new Error('Absolute paths not allowed');
    }
    
    const fullPath = path.join(BASE_DIRECTORY, normalizedPath);
    
    const isWithinBase = fullPath.startsWith(path.normalize(BASE_DIRECTORY));
    if (!isWithinBase) {
      throw new Error('Access outside allowed directory');
    }
    
    return {
      relativePath: normalizedPath,
      fullPath: fullPath
    };
  } catch (error) {
    logger.error(`Path validation failed: ${userPath}`, error);
    throw new Error(`Invalid path: ${error.message}`);
  }
}

async function validatePathExists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch (error) {
    logger.warn(`Path does not exist: ${fullPath}`);
    return false;
  }
}

async function secureWipeFile(filePath, passes = 7) {
  try {
    console.log(`🔍 Starting wipe for file: ${filePath}`);
    
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    console.log(`📊 File size: ${fileSize} bytes`);
    
    // Check file permissions
    await fs.access(filePath, fs.constants.W_OK);
    console.log(`✅ File is writable`);
    
    const fd = await fs.open(filePath, 'r+');
    console.log(`📝 File opened for writing`);
    
    const effectivePasses = Math.min(passes, WIPE_PATTERNS.length);
    console.log(`🔄 Performing ${effectivePasses} wipe passes`);
    
    for (let pass = 0; pass < effectivePasses; pass++) {
      const pattern = WIPE_PATTERNS[pass];
      const bufferSize = 64 * 1024;
      let bytesWritten = 0;
      
      console.log(`   Pass ${pass + 1}: Writing pattern`);
      
      while (bytesWritten < fileSize) {
        const remaining = fileSize - bytesWritten;
        const chunkSize = Math.min(bufferSize, remaining);
        const chunk = Buffer.alloc(chunkSize);
        
        for (let i = 0; i < chunkSize; i++) {
          chunk[i] = pattern[i % pattern.length];
        }
        
        await fs.write(fd, chunk, 0, chunkSize, bytesWritten);
        bytesWritten += chunkSize;
      }
      
      await fs.fsync(fd);
      console.log(`   ✓ Pass ${pass + 1} completed`);
    }
    
    await fs.close(fd);
    console.log(`✅ Wiping complete, deleting file`);
    
    await fs.unlink(filePath);
    console.log(`✅ File deleted: ${filePath}`);
    
    return {
      success: true,
      size: fileSize,
      passes: effectivePasses
    };
  } catch (error) {
    console.error(`❌ Error wiping file ${filePath}:`, error);
    console.error(`❌ Error stack:`, error.stack);
    
    // Try to close file descriptor if it's open
    try {
      if (fd) await fs.close(fd);
    } catch (closeError) {
      console.error('Could not close file descriptor:', closeError);
    }
    
    throw error;
  }
}

async function wipeDirectory(dirPath, sessionId) {
  let items;
  try {
    items = await fs.readdir(dirPath);
  } catch (error) {
    logger.error(`Error reading directory ${dirPath}:`, error);
    return {
      files: [],
      directories: [],
      errors: [{
        path: path.relative(BASE_DIRECTORY, dirPath),
        error: `Failed to read directory: ${error.message}`
      }]
    };
  }

  const results = {
    files: [],
    directories: [],
    errors: []
  };

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    
    try {
      const stat = await fs.stat(fullPath);
      
      if (stat.isDirectory()) {
        const subResults = await wipeDirectory(fullPath, sessionId);
        results.files.push(...subResults.files);
        results.directories.push(...subResults.directories);
        results.errors.push(...subResults.errors);
        
        try {
          await fs.rmdir(fullPath);
          results.directories.push(path.relative(BASE_DIRECTORY, fullPath));
          
          if (sessionId && wipeSessions.has(sessionId)) {
            const session = wipeSessions.get(sessionId);
            session.directoriesWiped = (session.directoriesWiped || 0) + 1;
            session.lastAccessed = new Date();
            wipeSessions.set(sessionId, session);
          }
        } catch (rmError) {
          results.errors.push({
            path: path.relative(BASE_DIRECTORY, fullPath),
            error: `Failed to remove directory: ${rmError.message}`
          });
        }
      } else {
        const wipeResult = await secureWipeFile(fullPath);
        results.files.push({
          path: path.relative(BASE_DIRECTORY, fullPath),
          ...wipeResult
        });
        
        if (sessionId && wipeSessions.has(sessionId)) {
          const session = wipeSessions.get(sessionId);
          session.filesWiped = (session.filesWiped || 0) + 1;
          session.lastAccessed = new Date();
          
          session.totalSize = (session.totalSize || 0) + (wipeResult.size || 0);
          wipeSessions.set(sessionId, session);
        }
      }
      
    } catch (error) {
      results.errors.push({
        path: path.relative(BASE_DIRECTORY, fullPath),
        error: error.message
      });
      logger.error(`Error processing ${fullPath}:`, error);
    }
  }

  return results;
}

// Update the updateWipeSession function to handle automatic uploads
function updateWipeSession(sessionId, updates) {
  if (wipeSessions.has(sessionId)) {
    const session = wipeSessions.get(sessionId);
    
    if (!updates.progress && session.totalPaths && (updates.processedPaths !== undefined)) {
      updates.progress = Math.round((updates.processedPaths / session.totalPaths) * 100);
    }
    
    const cleanUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        if (value instanceof Date) {
          cleanUpdates[key] = value.toISOString();
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          cleanUpdates[key] = JSON.parse(JSON.stringify(value));
        } else {
          cleanUpdates[key] = value;
        }
      }
    }
    
    Object.assign(session, cleanUpdates);
    session.lastAccessed = new Date();
    
    // Check if wipe is completed and trigger auto-upload
    if (updates.status === 'completed') {
      console.log(`✅ Wipe completed for session: ${sessionId}`);
      console.log(`📦 Starting automatic upload of certificate and logs to AWS S3...`);
      
      // Start auto-upload process
      autoUploadCertificateAndLogs(sessionId, session);
    }
    
    const importantUpdates = ['status', 'filesWiped', 'directoriesWiped', 'totalSize', 'progress', 'errors', 'endTime'];
    const hasImportantUpdate = Object.keys(updates).some(key => importantUpdates.includes(key));
    
    if (hasImportantUpdate) {
      setTimeout(async () => {
        try {
          await saveSessionToFile(sessionId, session);
        } catch (error) {
          logger.error(`Failed to async save session ${sessionId}:`, error.message);
        }
      }, 0);
    }
    
    wipeSessions.set(sessionId, session);
    
    if (updates.progress !== undefined && updates.progress % 25 === 0) {
      logger.info(`Session ${sessionId}: Progress ${updates.progress}% - ${session.filesWiped || 0} files, ${session.directoriesWiped || 0} directories`);
    }
    
    return session;
  }
  return null;
}

// Add this function to automatically upload certificate and logs
async function autoUploadCertificateAndLogs(sessionId, session) {
  try {
    console.log(`🚀 Starting auto-upload for session: ${sessionId}`);
    
    // Get username from session or use default
    const username = session.username || 'system-user';
    
    // Step 1: Generate and upload certificate
    console.log(`📄 Generating certificate for session: ${sessionId}`);
    const pdfBuffer = await generateCertificate(session);
    
    const certTimestamp = Date.now();
    const certFileName = `certificate-${sessionId}-${certTimestamp}.pdf`;
    const certTempPath = path.join(SESSIONS_DIR, certFileName);
    
    await fs.writeFile(certTempPath, pdfBuffer);
    
    // Upload certificate to S3
    const certUploadResult = await s3Service.uploadToS3(certTempPath, certFileName);
    
    if (!certUploadResult.success) {
      throw new Error(`Certificate upload failed: ${certUploadResult.error}`);
    }
    
    console.log(`✅ Certificate uploaded to S3: ${certUploadResult.s3Url}`);
    
    // Step 2: Generate and upload logs
    console.log(`📝 Generating logs for session: ${sessionId}`);
    const logContent = generateLogContent(session);
    
    const logTimestamp = Date.now();
    const logFileName = `logs-${sessionId}-${logTimestamp}.txt`;
    const logTempPath = path.join(SESSIONS_DIR, logFileName);
    
    await fs.writeFile(logTempPath, logContent);
    
    // Upload logs to S3
    const logUploadResult = await s3Service.uploadToS3(logTempPath, logFileName);
    
    if (!logUploadResult.success) {
      throw new Error(`Logs upload failed: ${logUploadResult.error}`);
    }
    
    console.log(`✅ Logs uploaded to S3: ${logUploadResult.s3Url}`);
    
    // Step 3: Create MongoDB document
    console.log(`💾 Saving session data to MongoDB...`);
    
    const sessionData = {
      username: username,
      sessionId: sessionId,
      certificateUrl: certUploadResult.s3Url,
      certificateFile: certFileName,
      logsUrl: logUploadResult.s3Url,
      logsFile: logFileName,
      filesWiped: session.filesWiped || 0,
      directoriesWiped: session.directoriesWiped || 0,
      totalSize: session.totalSize || 0,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      paths: session.paths || [],
      settings: session.settings || {}
    };
    
    // Save to MongoDB
    const savedSession = await UserSession.findOneAndUpdate(
      { sessionId: sessionId },
      sessionData,
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true 
      }
    );
    
    console.log(`✅ MongoDB document saved with ID: ${savedSession._id}`);
    
    // Step 4: Update session with S3 URLs
    session.certificateUrl = certUploadResult.s3Url;
    session.logsUrl = logUploadResult.s3Url;
    session.mongoId = savedSession._id;
    session.autoUploaded = true;
    session.autoUploadTime = new Date();
    
    // Save updated session
    wipeSessions.set(sessionId, session);
    await saveSessionToFile(sessionId, session);
    
    // Step 5: Clean up temp files
    await Promise.all([
      fs.remove(certTempPath).catch(e => console.warn('Could not remove cert temp file:', e.message)),
      fs.remove(logTempPath).catch(e => console.warn('Could not remove log temp file:', e.message))
    ]);
    
    console.log(`🎉 Auto-upload completed successfully for session: ${sessionId}`);
    console.log(`   Certificate: ${certUploadResult.s3Url}`);
    console.log(`   Logs: ${logUploadResult.s3Url}`);
    console.log(`   MongoDB ID: ${savedSession._id}`);
    
    return {
      success: true,
      certificateUrl: certUploadResult.s3Url,
      logsUrl: logUploadResult.s3Url,
      mongoId: savedSession._id
    };
    
  } catch (error) {
    console.error(`❌ Auto-upload failed for session ${sessionId}:`, error.message);
    console.error(`Stack:`, error.stack);
    
    // Store error in session
    if (wipeSessions.has(sessionId)) {
      const session = wipeSessions.get(sessionId);
      session.autoUploadError = error.message;
      session.autoUploadFailed = true;
      wipeSessions.set(sessionId, session);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

function generateCertificate(session) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      
      doc.fontSize(24).text('SECURE WIPE CERTIFICATE', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(12);
      doc.text(`Certificate ID: ${session.id}`);
      doc.text(`Wipe Date: ${session.endTime.toISOString()}`);
      doc.text(`Status: ${session.status}`);
      doc.text(`Total Files Wiped: ${session.filesWiped}`);
      doc.text(`Total Directories Wiped: ${session.directoriesWiped}`);
      doc.text(`Total Data Wiped: ${formatBytes(session.totalSize)}`);
      doc.text(`Base Directory: ${session.baseDirectory}`);
      doc.moveDown();
      
      doc.fontSize(14).text('WIPE DETAILS', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      
      session.paths.forEach((itemPath, index) => {
        doc.text(`${index + 1}. ${itemPath}`);
      });
      
      doc.moveDown();
      
      if (session.details && session.details.files && session.details.files.length > 0) {
        doc.fontSize(14).text('FILES WIPED', { underline: true });
        doc.moveDown();
        doc.fontSize(10);
        
        session.details.files.forEach((file, index) => {
          if (index < 50) {
            doc.text(`${index + 1}. ${file.path} (${formatBytes(file.size)})`);
          }
        });
        
        if (session.details.files.length > 50) {
          doc.text(`... and ${session.details.files.length - 50} more files`);
        }
        doc.moveDown();
      }
      
      doc.fontSize(14).text('TECHNICAL INFORMATION', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Wipe Standard: DoD 5220.22-M (${session.settings?.passes || 7} passes)`);
      doc.text(`Base Directory: ${session.baseDirectory}`);
      doc.text(`System: ${os.type()} ${os.release()}`);
      doc.text(`Processor: ${os.cpus()[0]?.model || 'Unknown'}`);
      doc.text(`Total Memory: ${formatBytes(os.totalmem())}`);
      
      if (session.errors && session.errors.length > 0) {
        doc.moveDown();
        doc.fontSize(14).text('ERRORS ENCOUNTERED', { underline: true });
        doc.moveDown();
        doc.fontSize(10);
        
        session.errors.forEach((error, index) => {
          if (index < 10) {
            doc.text(`${index + 1}. ${error.path}: ${error.error}`);
          }
        });
        
        if (session.errors.length > 10) {
          doc.text(`... and ${session.errors.length - 10} more errors`);
        }
      }
      
      doc.moveDown(3);
      doc.fontSize(8)
         .text('This certificate confirms that all specified files and directories have been securely wiped according to industry standards.', {
           align: 'center',
           width: 400
         });
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function generateLogContent(session) {
  const now = new Date();
  const startTime = session.startTime ? new Date(session.startTime) : null;
  const endTime = session.endTime ? new Date(session.endTime) : null;
  
  let duration = 'N/A';
  if (startTime && endTime) {
    const diffMs = endTime - startTime;
    const diffSec = Math.floor(diffMs / 1000);
    const minutes = Math.floor(diffSec / 60);
    const seconds = diffSec % 60;
    duration = `${minutes}m ${seconds}s`;
  }
  
  return `=== SECURE WIPE SESSION LOG ===
Generated: ${now.toISOString()}
Session Source: ${session.from || 'memory'}

SESSION INFORMATION:
-------------------
Session ID: ${session.id}
Status: ${session.status || 'unknown'}
Start Time: ${startTime ? startTime.toISOString() : 'N/A'}
End Time: ${endTime ? endTime.toISOString() : 'N/A'}
Duration: ${duration}
Last Accessed: ${session.lastAccessed ? new Date(session.lastAccessed).toISOString() : 'N/A'}

CONFIGURATION:
--------------
Base Directory: ${session.baseDirectory || BASE_DIRECTORY}
Wipe Passes: ${session.settings?.passes || 7}
Wipe Standard: ${session.settings?.passes === 7 ? 'DoD 5220.22-M' : 
                 session.settings?.passes === 3 ? '3-Pass Basic' :
                 session.settings?.passes === 1 ? 'Single Pass' :
                 `${session.settings?.passes || 7}-Pass Custom`}

PATHS TO WIPE:
--------------
${session.paths ? session.paths.map((p, i) => `${i + 1}. ${p}`).join('\n') : 'No paths specified'}

STATISTICS:
-----------
Files Wiped: ${session.filesWiped || 0}
Directories Wiped: ${session.directoriesWiped || 0}
Total Data Wiped: ${formatBytes(session.totalSize || 0)}
Total Errors: ${session.errors ? session.errors.length : 0}

DETAILED FILE LOGS:
-------------------
${session.details && session.details.files && session.details.files.length > 0 
  ? session.details.files.map((file, index) => 
      `[FILE ${index + 1}] ${file.path}\n` +
      `     Size: ${formatBytes(file.size || 0)}\n` +
      `     Passes: ${file.passes || 0}\n` +
      `     Status: ${file.success ? '✓ Success' : '✗ Failed'}\n` +
      `     -------------------------`
    ).join('\n')
  : 'No file details available'}

${session.details && session.details.directories && session.details.directories.length > 0 
  ? `\nDIRECTORY LOGS:\n---------------\n` +
    session.details.directories.map((dir, index) => 
      `[DIR ${index + 1}] ${dir}\n` +
      `     Status: ✓ Removed\n` +
      `     -------------------------`
    ).join('\n')
  : ''}

${session.errors && session.errors.length > 0 
  ? `\nERROR LOG:\n----------\n` +
    session.errors.map((error, index) => 
      `[ERROR ${index + 1}]\n` +
      `     Path: ${error.path || 'Unknown'}\n` +
      `     Error: ${error.error || 'Unknown error'}\n` +
      `     Time: ${now.toISOString()}\n` +
      `     -------------------------`
    ).join('\n')
  : 'No errors recorded'}

${session.invalidPaths && session.invalidPaths.length > 0 
  ? `\nINVALID PATHS (Not Processed):\n-----------------------------\n` +
    session.invalidPaths.map((path, index) => 
      `[INVALID ${index + 1}] ${path}`
    ).join('\n')
  : ''}

SYSTEM INFORMATION:
-------------------
Server Time: ${now.toISOString()}
Operating System: ${os.type()} ${os.release()} (${os.platform()})
CPU Architecture: ${os.arch()}
Total Memory: ${formatBytes(os.totalmem())}
Free Memory: ${formatBytes(os.freemem())}
Server Uptime: ${Math.floor(process.uptime() / 60)} minutes

=== END OF LOG ===
Session ID: ${session.id}
Log generated by SecureWipe Pro v2.4`;
}

// API Routes
app.get('/api/files', async (req, res) => {
  try {
    const { path: subPath = '' } = req.query;
    
    let targetPath = BASE_DIRECTORY;
    let relativePath = '';
    
    if (subPath && subPath.trim() !== '') {
      try {
        const pathInfo = validateAndSanitizePath(subPath);
        targetPath = pathInfo.fullPath;
        relativePath = pathInfo.relativePath;
      } catch (error) {
        return res.status(400).json({ 
          error: `Invalid path: ${error.message}`,
          baseDirectory: BASE_DIRECTORY
        });
      }
    }
    
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ 
        error: 'Directory not found',
        requestedPath: subPath,
        baseDirectory: BASE_DIRECTORY
      });
    }
    
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ 
        error: 'Path is not a directory',
        requestedPath: subPath
      });
    }
    
    const dirents = await fs.readdir(targetPath, { withFileTypes: true });
    const items = await Promise.all(
      dirents.map(async (dirent) => {
        const fullPath = path.join(targetPath, dirent.name);
        const itemRelativePath = path.relative(BASE_DIRECTORY, fullPath);
        
        try {
          const stats = await fs.stat(fullPath);
          return {
            name: dirent.name,
            type: dirent.isDirectory() ? 'directory' : 'file',
            path: itemRelativePath,
            fullPath: fullPath,
            size: stats.size,
            formattedSize: formatBytes(stats.size),
            modified: stats.mtime
          };
        } catch (error) {
          return {
            name: dirent.name,
            type: dirent.isDirectory() ? 'directory' : 'file',
            path: itemRelativePath,
            fullPath: fullPath,
            size: 0,
            formattedSize: 'Unknown',
            error: error.message
          };
        }
      })
    );

    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      baseDirectory: BASE_DIRECTORY,
      currentPath: targetPath,
      relativePath: relativePath,
      items: items,
      totalItems: items.length
    });

  } catch (error) {
    logger.error('Error reading directory:', error);
    res.status(500).json({ 
      error: 'Failed to read directory',
      details: error.message,
      baseDirectory: BASE_DIRECTORY
    });
  }
});

app.post('/api/wipe/start', async (req, res) => {
  try {
    const { paths, settings = {}, sessionId: clientSessionId } = req.body;
    
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'No paths provided' });
    }
    
    // Use client-provided sessionId or create new one
    const sessionId = clientSessionId || uuidv4();
    
    const validPaths = [];
    const invalidPaths = [];
    
    for (const userPath of paths) {
      try {
        const pathInfo = validateAndSanitizePath(userPath);
        const exists = await validatePathExists(pathInfo.fullPath);
        
        if (exists) {
          validPaths.push({
            userPath: userPath,
            fullPath: pathInfo.fullPath,
            relativePath: pathInfo.relativePath
          });
        } else {
          invalidPaths.push(`${userPath} (File/directory not found)`);
        }
      } catch (error) {
        invalidPaths.push(`${userPath} (${error.message})`);
      }
    }
    
    if (validPaths.length === 0) {
      return res.status(400).json({ 
        error: 'No valid paths found',
        invalidPaths: invalidPaths,
        baseDirectory: BASE_DIRECTORY
      });
    }
    
    // Create or update session
    if (wipeSessions.has(sessionId)) {
      // Update existing session
      const session = wipeSessions.get(sessionId);
      Object.assign(session, {
        paths: validPaths.map(p => p.relativePath),
        settings: settings,
        status: 'pending',
        startTime: new Date(),
        lastAccessed: new Date(),
        baseDirectory: BASE_DIRECTORY
      });
      wipeSessions.set(sessionId, session);
    } else {
      // Create new session
      const session = {
  id: sessionId,
  paths: validPaths.map(p => p.relativePath),
  settings: settings,
  startTime: new Date(),
  status: 'pending',
  filesWiped: 0,
  directoriesWiped: 0,
  totalSize: 0,
  errors: [],
  baseDirectory: BASE_DIRECTORY,
  lastAccessed: new Date(),
  from: 'memory',
  clientProvided: !!clientSessionId,
  // Add username from request body
  username: req.body.username || 'anonymous'
};
      
      wipeSessions.set(sessionId, session);
    }
    
    // Save to file for persistence
    saveSessionToFile(sessionId, wipeSessions.get(sessionId));
    
    // Start wipe process immediately
    (async () => {
      try {
        updateWipeSession(sessionId, { 
          status: 'in-progress',
          startTime: new Date(),
          totalPaths: validPaths.length
        });
        
        let totalResults = {
          files: [],
          directories: [],
          errors: []
        };
        
        let processedCount = 0;
        
        for (const pathInfo of validPaths) {
          const { fullPath, relativePath } = pathInfo;
          
          try {
            const stat = await fs.stat(fullPath);
            
            if (stat.isDirectory()) {
              logger.info(`Processing directory: ${relativePath}`);
              const dirResults = await wipeDirectory(fullPath, sessionId);
              totalResults.files.push(...dirResults.files);
              totalResults.directories.push(...dirResults.directories);
              totalResults.errors.push(...dirResults.errors);
              
              try {
                await fs.rmdir(fullPath);
                totalResults.directories.push(relativePath);
                logger.info(`Successfully removed directory: ${relativePath}`);
              } catch (rmError) {
                totalResults.errors.push({
                  path: relativePath,
                  error: `Failed to remove directory: ${rmError.message}`
                });
                logger.error(`Failed to remove directory ${relativePath}:`, rmError);
              }
            } else {
              logger.info(`Processing file: ${relativePath}`);
              const fileResult = await secureWipeFile(fullPath, settings.passes || 7);
              totalResults.files.push({
                path: relativePath,
                ...fileResult
              });
              logger.info(`Successfully wiped file: ${relativePath}`);
            }
            
          } catch (error) {
            totalResults.errors.push({
              path: relativePath,
              error: error.message
            });
            logger.error(`Error processing ${relativePath}:`, error);
          }
          
          processedCount++;
          const progress = Math.round((processedCount / validPaths.length) * 100);
          updateWipeSession(sessionId, {
            filesWiped: totalResults.files.length,
            directoriesWiped: totalResults.directories.length,
            currentPath: relativePath,
            progress: progress,
            processedPaths: processedCount
          });
        }
        
        const totalSize = totalResults.files.reduce((sum, file) => sum + (file.size || 0), 0);
        
        updateWipeSession(sessionId, {
          status: 'completed',
          endTime: new Date(),
          filesWiped: totalResults.files.length,
          directoriesWiped: totalResults.directories.length,
          totalSize: totalSize,
          errors: totalResults.errors,
          details: totalResults,
          invalidPaths: invalidPaths.length > 0 ? invalidPaths : undefined,
          progress: 100
        });
        
        logger.info(`Wipe session ${sessionId} completed: ${totalResults.files.length} files, ${totalResults.directories.length} directories, ${totalSize} bytes`);
        
      } catch (error) {
        logger.error('Wipe process failed:', error);
        updateWipeSession(sessionId, {
          status: 'failed',
          endTime: new Date(),
          error: error.message,
          progress: 100
        });
      }
    })();
    
    res.json({ 
      success: true,
      sessionId,
      message: 'Wipe process started',
      validPaths: validPaths.map(p => p.relativePath),
      invalidPaths: invalidPaths.length > 0 ? invalidPaths : undefined,
      baseDirectory: BASE_DIRECTORY,
      totalPaths: paths.length,
      settings: settings
    });
    
  } catch (error) {
    logger.error('Error starting wipe:', error);
    res.status(500).json({ 
      error: 'Failed to start wipe process',
      details: error.message 
    });
  }
});

app.get('/api/wipe/status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  if (wipeSessions.has(sessionId)) {
    const session = wipeSessions.get(sessionId);
    session.lastAccessed = new Date();
    
    if (session.status === 'in-progress') {
      const totalPaths = session.paths ? session.paths.length : 0;
      const processedPaths = (session.filesWiped || 0) + (session.directoriesWiped || 0);
      session.progress = totalPaths > 0 ? Math.round((processedPaths / totalPaths) * 100) : 0;
    }
    
    if (session.status === 'completed' || session.status === 'failed') {
      if (!completedNotifications.has(sessionId)) {
        session.firstCompletionNotification = true;
        completedNotifications.add(sessionId);
      } else {
        session.firstCompletionNotification = false;
      }
    }
    
    res.json(session);
    return;
  }
  
  try {
    const session = await loadSessionFromFile(sessionId);
    if (session) {
      res.json(session);
    } else {
      res.status(404).json({ 
        error: 'Session not found',
        message: `Session ${sessionId} does not exist or could not be loaded`,
        hint: 'Sessions are kept for 7 days after creation'
      });
    }
  } catch (error) {
    logger.error(`Error loading session ${sessionId}:`, error);
    res.status(500).json({ 
      error: 'Failed to load session',
      message: error.message,
      sessionId: sessionId
    });
  }
});

app.get('/api/wipe/certificate/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    let session = wipeSessions.get(sessionId);
    if (!session) {
      session = await loadSessionFromFile(sessionId);
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.status !== 'completed') {
      return res.status(400).json({ 
        error: 'Wipe process not completed',
        currentStatus: session.status 
      });
    }
    
    const pdfBuffer = await generateCertificate(session);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="wipe-certificate-${sessionId}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    logger.error('Error generating certificate:', error);
    res.status(500).json({ 
      error: 'Failed to generate certificate',
      details: error.message 
    });
  }
});

app.get('/api/wipe/logs/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    let session = null;
    let source = 'memory';
    
    if (wipeSessions.has(sessionId)) {
      session = wipeSessions.get(sessionId);
      source = 'active memory';
      session.lastAccessed = new Date();
    } else {
      session = await loadSessionFromFile(sessionId);
      if (session) {
        source = 'file storage';
      }
    }
    
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found',
        message: `Session ID ${sessionId} does not exist or has expired`,
        availableSessions: Array.from(wipeSessions.keys()),
        hint: 'Sessions are kept for 7 days after completion'
      });
    }
    
    session.from = source;
    session.lastAccessed = new Date();
    
    const logContent = generateLogContent(session);
    
    if (source === 'memory') {
      wipeSessions.set(sessionId, session);
    }
    saveSessionToFile(sessionId, session);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="wipe-logs-${sessionId}.txt"`);
    res.send(logContent);
    
    logger.info(`Logs downloaded for session ${sessionId} from ${source}`);
    
  } catch (error) {
    logger.error('Error generating logs:', error);
    res.status(500).json({ 
      error: 'Failed to generate logs',
      details: error.message,
      sessionId: req.params.sessionId
    });
  }
});

app.get('/api/wipe/sessions', (req, res) => {
  const sessions = Array.from(wipeSessions.entries()).map(([id, session]) => ({
    id: id,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime,
    filesWiped: session.filesWiped,
    directoriesWiped: session.directoriesWiped,
    totalSize: session.totalSize,
    paths: session.paths ? session.paths.length : 0,
    lastAccessed: session.lastAccessed
  }));
  
  res.json({
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => s.status === 'in-progress').length,
    completedSessions: sessions.filter(s => s.status === 'completed').length,
    failedSessions: sessions.filter(s => s.status === 'failed').length,
    sessions: sessions
  });
});

app.post('/api/script/generate', async (req, res) => {
  try {
    const { paths, platform = 'windows', settings = {} } = req.body;
    
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'No paths provided' });
    }
    
    const wipePasses = settings.passes || 7;
    const baseDir = BASE_DIRECTORY;
    
    logger.info(`Generated ${platform} wipe script for ${paths.length} paths`);
    
    let scriptContent = '';
    
    if (platform === 'windows') {
      scriptContent = `# Secure Wipe Script - Windows PowerShell
# Generated: ${new Date().toISOString()}
# Base Directory: ${baseDir}
# Wipe Passes: ${wipePasses}
# Paths to wipe: ${paths.length}

$ErrorActionPreference = "Stop"
$BaseDirectory = "${baseDir.replace(/\\/g, '\\\\')}"
$WipePasses = ${wipePasses}

function Secure-WipeFile {
    param([string]$RelativePath)
    
    try {
        $FilePath = Join-Path $BaseDirectory $RelativePath
        
        if (-not (Test-Path $FilePath)) {
            Write-Warning "File not found: \$RelativePath"
            return
        }
        
        $fileInfo = Get-Item $FilePath
        $fileSize = $fileInfo.Length
        
        # Wipe patterns
        $patterns = @(
            [byte[]]@(0x00),    # Pass 1: Zeros
            [byte[]]@(0xFF),    # Pass 2: Ones
            [byte[]]@(0xAA),    # Pass 3: Alternating 10101010
            [byte[]]@(0x55),    # Pass 4: Alternating 01010101
            [byte[]]@(0x92,0x49,0x24),  # Pass 5: Random
            [byte[]]@(0x49,0x24,0x92),  # Pass 6: Random
            [byte[]]@(0x24,0x92,0x49)   # Pass 7: Random
        )
        
        $stream = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write)
        
        for ($pass = 0; $pass -lt $WipePasses; $pass++) {
            $stream.Position = 0
            $bufferSize = 64KB
            $bytesWritten = 0
            
            while ($bytesWritten -lt $fileSize) {
                $remaining = $fileSize - $bytesWritten
                $chunkSize = [Math]::Min($bufferSize, $remaining)
                $chunk = New-Object byte[] $chunkSize
                
                if ($pass -lt 7 -and $pass -lt $patterns.Count) {
                    $pattern = $patterns[$pass]
                    for ($i = 0; $i -lt $chunkSize; $i++) {
                        $chunk[$i] = $pattern[$i % $pattern.Length]
                    }
                } else {
                    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
                    $random.GetBytes($chunk)
                    $random.Dispose()
                }
                
                $stream.Write($chunk, 0, $chunkSize)
                $bytesWritten += $chunkSize
            }
            $stream.Flush()
        }
        
        $stream.Close()
        Remove-Item $FilePath -Force
        Write-Host "✓ Securely wiped: \$RelativePath"
        
    } catch {
        Write-Error "Failed to wipe \$RelativePath : \$_"
    }
}

function Secure-WipeDirectory {
    param([string]$RelativePath)
    
    $DirPath = Join-Path $BaseDirectory $RelativePath
    
    if (-not (Test-Path $DirPath)) {
        Write-Warning "Directory not found: \$RelativePath"
        return
    }
    
    $files = Get-ChildItem $DirPath -File -Recurse
    foreach ($file in $files) {
        $relativeFilePath = \$file.FullName.Substring(\$BaseDirectory.Length + 1)
        Secure-WipeFile \$relativeFilePath
    }
    
    $dirs = Get-ChildItem $DirPath -Directory -Recurse | Sort-Object -Property FullName -Descending
    foreach ($dir in $dirs) {
        Remove-Item \$dir.FullName -Force -Recurse
        Write-Host "✓ Removed directory: \$(\$dir.FullName.Substring(\$BaseDirectory.Length + 1))"
    }
    
    Remove-Item $DirPath -Force -Recurse
    Write-Host "✓ Removed main directory: \$RelativePath"
}

Write-Host "Starting secure wipe process in: \$BaseDirectory" -ForegroundColor Green
Write-Host ""
`;

      paths.forEach((relativePath, index) => {
        const escapedPath = relativePath.replace(/\\/g, '\\\\').replace(/"/g, '`"');
        scriptContent += `# Processing item ${index + 1}
try {
    \$fullPath = Join-Path \$BaseDirectory "${escapedPath}"
    if (Test-Path \$fullPath) {
        \$item = Get-Item \$fullPath
        if (\$item.PSIsContainer) {
            Write-Host "Processing directory: ${relativePath}" -ForegroundColor Yellow
            Secure-WipeDirectory "${escapedPath}"
        } else {
            Write-Host "Processing file: ${relativePath}" -ForegroundColor Yellow
            Secure-WipeFile "${escapedPath}"
        }
    } else {
        Write-Warning "Path not found: ${relativePath}"
    }
} catch {
    Write-Error "Error processing ${relativePath}: \$_"
}
Write-Host ""
`;
      });

      scriptContent += `
\$totalEndTime = Get-Date

Write-Host "========================================" -ForegroundColor Green
Write-Host "WIPE PROCESS COMPLETED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Base Directory: \$BaseDirectory"
Write-Host "Total Items Processed: ${paths.length}"
Write-Host "Wipe Standard: ${wipePasses}-pass secure wipe"
Write-Host "========================================" -ForegroundColor Green

\$certificateContent = @"
SECURE WIPE CERTIFICATE
========================
Date: \$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Base Directory: \$BaseDirectory
Total Items: ${paths.length}
Platform: Windows PowerShell
Wipe Standard: ${wipePasses}-pass secure wipe

PATHS WIPED:
$(${paths.map(p => p).join('" + "`n" + "')})

This certificate confirms that the specified files and directories
have been securely wiped according to industry standards.
"@

\$certificateContent | Out-File "wipe-certificate.txt"
Write-Host "Certificate saved to: wipe-certificate.txt" -ForegroundColor Green
`;
      
    } else {
      scriptContent = `#!/bin/bash
# Secure Wipe Script - Linux/Mac
# Generated: $(date -Iseconds)
# Base Directory: ${baseDir}
# Wipe Passes: ${wipePasses}
# Paths to wipe: ${paths.length}

set -e

BASE_DIR="${baseDir}"
LOG_FILE="wipe-$(date +%Y%m%d-%H%M%S).log"
WIPE_PASSES=${wipePasses}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] \$1" | tee -a "\$LOG_FILE"
}

secure_wipe_file() {
    local relative_path="\$1"
    local file_path="\${BASE_DIR}/\${relative_path}"
    
    if [ ! -f "\$file_path" ]; then
        log "File not found: \$relative_path"
        return 1
    fi
    
    local file_size=\$(stat -f%z "\$file_path" 2>/dev/null || stat -c%s "\$file_path")
    
    for ((i=1; i<=\$WIPE_PASSES; i++)); do
        case \$i in
            1) pattern="00" ;;
            2) pattern="ff" ;;
            3) pattern="aa" ;;
            4) pattern="55" ;;
            5) pattern="924924" ;;
            6) pattern="492492" ;;
            7) pattern="249249" ;;
            *) 
                pattern=\$(openssl rand -hex 3 2>/dev/null || head -c 3 /dev/urandom | xxd -p)
                ;;
        esac
        
        echo -n "\$pattern" | xxd -r -p | \\
        dd of="\$file_path" bs=64k conv=notrunc 2>/dev/null
        sync
    done
    
    rm -f "\$file_path"
    log "✓ Securely wiped: \$relative_path"
}

secure_wipe_directory() {
    local relative_path="\$1"
    local dir_path="\${BASE_DIR}/\${relative_path}"
    
    if [ ! -d "\$dir_path" ]; then
        log "Directory not found: \$relative_path"
        return 1
    fi
    
    find "\$dir_path" -type f | while read -r file; do
        local file_relative="\${file#\${BASE_DIR}/}"
        secure_wipe_file "\$file_relative"
    done
    
    find "\$dir_path" -type d | sort -r | while read -r dir; do
        if [ "\$dir" != "\$BASE_DIR" ] && [ "\$dir" != "." ] && [ "\$dir" != ".." ]; then
            rmdir "\$dir" 2>/dev/null || true
            local dir_relative="\${dir#\${BASE_DIR}/}"
            log "✓ Removed directory: \$dir_relative"
        fi
    done
    
    rmdir "\$dir_path" 2>/dev/null && log "✓ Removed main directory: \$relative_path"
}

for cmd in dd sync; do
    if ! command -v \$cmd &> /dev/null; then
        log "Error: \$cmd is required but not installed"
        exit 1
    fi
done

if [ ! -d "\$BASE_DIR" ]; then
    log "Error: Base directory does not exist: \$BASE_DIR"
    exit 1
fi

log "Starting secure wipe process in: \$BASE_DIR"
echo ""

start_time=\$(date +%s)
processed_count=0

`;

      paths.forEach((relativePath, index) => {
        const escapedPath = relativePath.replace(/'/g, "'\\''");
        scriptContent += `# Processing item $((index + 1))
full_path="\${BASE_DIR}/${escapedPath}"
if [ -e "\$full_path" ]; then
    if [ -d "\$full_path" ]; then
        log "Processing directory: ${relativePath}"
        secure_wipe_directory "${escapedPath}"
    elif [ -f "\$full_path" ]; then
        log "Processing file: ${relativePath}"
        secure_wipe_file "${escapedPath}"
    else
        log "Unsupported file type: ${relativePath}"
    fi
    processed_count=\$((processed_count + 1))
else
    log "Path not found: ${relativePath}"
fi
echo ""
`;
      });

      scriptContent += `
end_time=\$(date +%s)
duration=\$((end_time - start_time))

echo "========================================"
echo "WIPE PROCESS COMPLETED"
echo "========================================"
log "Base Directory: \$BASE_DIR"
log "Start Time: \$(date -d @\$start_time '+%Y-%m-%d %H:%M:%S')"
log "End Time: \$(date -d @\$end_time '+%Y-%m-%d %H:%M:%S')"
log "Duration: \$((duration / 3600))h:\$(((duration % 3600) / 60))m:\$((duration % 60))s"
log "Total Items Processed: \$processed_count"
log "Wipe Standard: \$WIPE_PASSES-pass secure wipe"
echo "========================================"

cat > wipe-certificate.txt << EOF
SECURE WIPE CERTIFICATE
========================
Date: \$(date '+%Y-%m-%d %H:%M:%S')
Base Directory: \$BASE_DIR
Total Items: \$processed_count
Platform: \$(uname -s) \$(uname -r)
Wipe Standard: \$WIPE_PASSES-pass secure wipe

PATHS WIPED:
$(printf '%s\n' "\${paths[@]}")

This certificate confirms that the specified files and directories
have been securely wiped according to industry standards.
EOF

log "Certificate saved to: wipe-certificate.txt"
log "Log saved to: \$LOG_FILE"
`;
    }
    
    const scriptName = platform === 'windows' ? 'secure-wipe.ps1' : 'secure-wipe.sh';
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${scriptName}"`);
    res.send(scriptContent);
    
  } catch (error) {
    logger.error('Error generating script:', error);
    res.status(500).json({ 
      error: 'Failed to generate script',
      details: error.message 
    });
  }
});

// In server.js - Update the S3 upload endpoint

// Update the S3 upload endpoint in server.js
// Update the S3 upload endpoint in server.js
app.post('/api/s3/upload', async (req, res) => {
  try {
    console.log('📤 S3 Upload request received');
    
    const { files, password, sessionId, username } = req.body;
    
    // Validate input
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No files specified for upload'
      });
    }
    
    if (!sessionId) {
      return res.status(400).json({ 
        success: false,
        error: 'Session ID is required' 
      });
    }
    
    if (!username) {
      return res.status(400).json({ 
        success: false,
        error: 'Username is required' 
      });
    }
    
    console.log(`👤 User for backup: ${username}`);
    
    // Test S3 connection first
    console.log('🔄 Testing S3 connection before upload...');
    const connectionTest = await s3Service.testS3Connection();
    console.log('Connection test result:', connectionTest);
    
    const uploadResults = [];
    const errors = [];
    const backupUrls = [];
    const fileDetails = [];
    
    // Process each file
    for (const fileInfo of files) {
      try {
        const filePath = fileInfo.path;
        const fileName = fileInfo.name || path.basename(filePath) || 'unnamed-file';
        
        if (!filePath) {
          errors.push({ file: fileInfo, error: 'Missing file path' });
          continue;
        }
        
        // Validate path
        let fullPath;
        try {
          const pathInfo = validateAndSanitizePath(filePath);
          fullPath = pathInfo.fullPath;
        } catch (pathError) {
          // Try direct path if validation fails
          fullPath = path.join(BASE_DIRECTORY, filePath);
          console.log(`Using direct path: ${fullPath}`);
        }
        
        // Check if file exists
        if (!fs.existsSync(fullPath)) {
          errors.push({ 
            file: fileInfo, 
            error: `File not found: ${fullPath}`
          });
          continue;
        }
        
        console.log(`📄 Uploading: ${fileName} from ${fullPath}`);
        
        // Upload to S3 (with fallback)
        const result = await s3Service.uploadToS3(fullPath, fileName, password);
        
        if (result.success) {
          uploadResults.push(result);
          
          const backupInfo = {
            fileName: result.fileName,
            s3Url: result.s3Url,
            fileUrl: result.fileUrl,
            fileKey: result.fileKey,
            encrypted: result.encrypted,
            size: result.size,
            uploadedAt: result.uploadedAt,
            isRealS3: result.isRealS3,
            region: result.region,
            bucket: result.bucket
          };
          
          backupUrls.push(result.s3Url);
          fileDetails.push(backupInfo);
          
          console.log(`✅ Uploaded: ${fileName} (${result.isRealS3 ? 'S3' : 'Local'})`);
        } else {
          errors.push({ 
            file: fileInfo, 
            error: result.error || 'Upload failed'
          });
        }
        
      } catch (fileError) {
        console.error(`❌ Error processing file:`, fileError);
        errors.push({ 
          file: fileInfo, 
          error: fileError.message
        });
      }
    }
    
    // Save backup information to MongoDB - APPEND to existing array
    let savedBackup = null;
    let action = 'created'; // Track whether we created or appended
    let existingBackupFound = false;
    
    if (backupUrls.length > 0) {
      try {
        console.log('💾 Saving/Updating backup in MongoDB...');
        
        // Check if backup already exists for this session
        let existingBackup = await UserBackup.findOne({ sessionId: sessionId });
        
        if (existingBackup) {
          existingBackupFound = true;
          action = 'appended';
          console.log(`📝 Found existing backup for session ${sessionId}, appending new files...`);
          
          // Append new backup URLs to existing array
          existingBackup.backupUrls = [
            ...(existingBackup.backupUrls || []),
            ...backupUrls
          ];
          
          // Append new file details to existing array
          existingBackup.fileDetails = [
            ...(existingBackup.fileDetails || []),
            ...fileDetails
          ];
          
          // Update file count
          existingBackup.fileCount = existingBackup.backupUrls.length;
          
          // Update timestamps
          existingBackup.uploadedAt = new Date();
          existingBackup.updatedAt = new Date();
          
          // Save the updated document
          savedBackup = await existingBackup.save();
          
          console.log(`✅ Appended ${backupUrls.length} new files to existing backup`);
          console.log(`   Total files in backup: ${savedBackup.backupUrls.length}`);
          console.log(`   Backup ID: ${savedBackup._id}`);
        } else {
          console.log(`📝 Creating new backup for session ${sessionId}...`);
          
          // Create new backup document
          const backupData = {
            username: username,
            sessionId: sessionId,
            backupUrls: backupUrls,
            fileDetails: fileDetails,
            fileCount: backupUrls.length,
            encrypted: !!password,
            access: [username],
            uploadedAt: new Date()
          };
          
          savedBackup = await UserBackup.create(backupData);
          
          console.log(`✅ Created new backup in MongoDB for session: ${sessionId}`);
          console.log(`   Backup ID: ${savedBackup._id}`);
          console.log(`   Files: ${savedBackup.backupUrls.length}`);
        }
        
        // Also store in wipe session for immediate access
        if (wipeSessions.has(sessionId)) {
          const session = wipeSessions.get(sessionId);
          if (!session.backups) {
            session.backups = [];
          }
          session.backups.push({
            backupId: savedBackup._id,
            urls: backupUrls,
            fileDetails: fileDetails,
            savedAt: new Date().toISOString()
          });
          updateWipeSession(sessionId, { backups: session.backups });
        }
        
      } catch (mongoError) {
        console.error('❌ Failed to save backup to MongoDB:', mongoError.message);
        console.error('MongoDB Error Stack:', mongoError.stack);
        // Don't fail the whole request, just log the error
      }
    }
    
    console.log(`📈 Upload Summary: ${uploadResults.length} successful, ${errors.length} failed`);
    
    res.json({
      success: true,
      uploaded: uploadResults.length,
      failed: errors.length,
      uploads: uploadResults,
      backupUrls: backupUrls,
      fileDetails: fileDetails,
      errors: errors,
      sessionId: sessionId,
      username: username,
      mongoBackupId: savedBackup?._id || null,
      action: action, // 'created' or 'appended'
      existingBackupFound: existingBackupFound,
      totalFilesInBackup: savedBackup?.backupUrls?.length || 0,
      note: uploadResults.length > 0 && uploadResults[0].isRealS3 
        ? 'Files uploaded to AWS S3 and saved to database' 
        : 'Files saved locally (S3 simulation mode)'
    });
    
  } catch (error) {
    console.error('❌ S3 upload route error:', error);
    console.error('Full error stack:', error.stack);
    
    res.status(500).json({ 
      success: false,
      error: 'Upload service error',
      details: error.message
    });
  }
});

app.get('/api/s3/uploads/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    let session = wipeSessions.get(sessionId);
    if (!session) {
      session = await loadSessionFromFile(sessionId);
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const uploads = session.s3Uploads || [];
    
    res.json({
      sessionId,
      totalUploads: uploads.length,
      uploads: uploads
    });
    
  } catch (error) {
    logger.error('Error getting S3 uploads:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/s3/download/:sessionId/:fileIndex', async (req, res) => {
  try {
    const { sessionId, fileIndex } = req.params;
    const index = parseInt(fileIndex);
    
    let session = wipeSessions.get(sessionId);
    if (!session) {
      session = await loadSessionFromFile(sessionId);
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const uploads = session.s3Uploads || [];
    if (index < 0 || index >= uploads.length) {
      return res.status(404).json({ error: 'File not found in session' });
    }
    
    const upload = uploads[index];
    
    if (upload.isRealS3) {
      const downloadUrl = await s3Service.generatePresignedUrl(upload.s3Key, 3600);
      if (downloadUrl) {
        return res.json({
          downloadUrl,
          fileName: upload.originalName,
          expiresIn: 3600
        });
      }
    }
    
    res.json({
      fileUrl: upload.s3Url,
      fileName: upload.originalName,
      note: upload.isRealS3 ? 'Download from S3' : 'File saved locally (development mode)'
    });
    
  } catch (error) {
    logger.error('Error generating download URL:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  const baseDirExists = fs.existsSync(BASE_DIRECTORY);
  
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    sessions: wipeSessions.size,
    baseDirectory: BASE_DIRECTORY,
    directoryExists: baseDirExists,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    baseDirectory: BASE_DIRECTORY,
    allowedPaths: ALLOWED_PATHS,
    platform: os.platform(),
    architecture: os.arch(),
    serverTime: new Date().toISOString(),
    nodeVersion: process.version,
    sessionsDirectory: SESSIONS_DIR,
    totalSessions: wipeSessions.size
  });
});

// Add this endpoint to server.js
app.get('/api/s3/test', async (req, res) => {
  try {
    const connection = await s3Service.checkS3Connection();
    
    if (connection.connected) {
      // Try to list files to verify permissions
      const files = await s3Service.listS3Files();
      
      res.json({
        success: true,
        message: 'S3 connection successful',
        details: connection,
        bucket: connection.bucket,
        region: connection.region,
        filesCount: files.total || 0,
        isRealS3: files.isRealS3,
        note: files.isRealS3 ? 'Connected to real AWS S3' : 'Using simulation mode'
      });
    } else {
      res.json({
        success: false,
        message: 'S3 connection failed',
        details: connection,
        note: 'Check your AWS credentials and bucket name'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

app.get('/api/s3/test-connection', async (req, res) => {
  try {
    const connection = await s3Service.checkS3Connection();
    
    // Test upload with a small test file
    const testFilePath = path.join(__dirname, 'test-upload.txt');
    await fs.writeFile(testFilePath, 'Test upload for S3 connection verification');
    
    const uploadResult = await s3Service.uploadToS3(testFilePath, 'test-upload.txt');
    
    // Clean up test file
    await fs.remove(testFilePath);
    
    res.json({
      connection: connection,
      uploadTest: uploadResult,
      config: s3Service.getConfig(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Add a debug endpoint to check file paths
app.get('/api/debug/path/:filePath', async (req, res) => {
  try {
    const { filePath } = req.params;
    console.log('Debugging path:', filePath);
    
    // Validate and sanitize
    const pathInfo = validateAndSanitizePath(filePath);
    const fullPath = pathInfo.fullPath;
    
    console.log('Full path:', fullPath);
    console.log('Relative path:', pathInfo.relativePath);
    console.log('Base directory:', BASE_DIRECTORY);
    
    const exists = await fs.pathExists(fullPath);
    const isDirectory = exists ? (await fs.stat(fullPath)).isDirectory() : false;
    
    res.json({
      success: true,
      filePath,
      fullPath,
      relativePath: pathInfo.relativePath,
      exists,
      isDirectory,
      baseDirectory: BASE_DIRECTORY,
      normalizedPath: path.normalize(filePath)
    });
    
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      filePath: req.params.filePath
    });
  }
});

// Also add a test endpoint to verify the file exists
app.get('/api/test/file/:filePath', async (req, res) => {
  try {
    const { filePath } = req.params;
    console.log('Testing file path:', filePath);
    
    // Try direct path first
    const directPath = path.join(BASE_DIRECTORY, filePath);
    console.log('Direct path:', directPath);
    console.log('Exists?', await fs.pathExists(directPath));
    
    // Try with validateAndSanitizePath
    try {
      const pathInfo = validateAndSanitizePath(filePath);
      console.log('Validated path info:', pathInfo);
      console.log('Validated path exists?', await fs.pathExists(pathInfo.fullPath));
    } catch (validateError) {
      console.log('Validation error:', validateError.message);
    }
    
    res.json({
      filePath,
      directPath,
      directExists: await fs.pathExists(directPath),
      baseDirectory: BASE_DIRECTORY
    });
    
  } catch (error) {
    res.json({
      error: error.message,
      stack: error.stack
    });
  }
});

app.get('/api/test/file/:filePath', async (req, res) => {
  try {
    const { filePath } = req.params;
    console.log('Testing file path:', filePath);
    
    // Try direct path first
    const directPath = path.join(BASE_DIRECTORY, filePath);
    console.log('Direct path:', directPath);
    console.log('Exists?', await fs.pathExists(directPath));
    
    // Try with validateAndSanitizePath
    try {
      const pathInfo = validateAndSanitizePath(filePath);
      console.log('Validated path info:', pathInfo);
      console.log('Validated path exists?', await fs.pathExists(pathInfo.fullPath));
    } catch (validateError) {
      console.log('Validation error:', validateError.message);
    }
    
    res.json({
      filePath,
      directPath,
      directExists: await fs.pathExists(directPath),
      baseDirectory: BASE_DIRECTORY
    });
    
  } catch (error) {
    res.json({
      error: error.message,
      stack: error.stack
    });
  }
});

app.get('/api/user/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        success: false,
        error: 'Username is required' 
      });
    }

    console.log(`📋 Fetching sessions for user: ${username}`);
    
    let sessions = [];
    let source = 'memory';

    try {
      // Try to get from MongoDB
      sessions = await UserSession.find({ username: username }).sort({ createdAt: -1 });
      source = 'mongodb';
      console.log(`✅ Got ${sessions.length} sessions from MongoDB`);
    } catch (mongoError) {
      console.error('❌ MongoDB query failed:', mongoError.message);
      // Fallback to memory store
      sessions = await memoryStore.getUserSessions(username);
      source = 'memory-fallback';
      console.log(`🔄 Using memory store: ${sessions.length} sessions`);
    }

    // Get wipe session details for each session
    const detailedSessions = await Promise.all(
      sessions.map(async (session) => {
        try {
          const sessionObj = session.toObject ? session.toObject() : session;
          
          // Try to get wipe session details
          if (wipeSessions.has(sessionObj.sessionId)) {
            const wipeSession = wipeSessions.get(sessionObj.sessionId);
            return {
              ...sessionObj,
              filesWiped: wipeSession.filesWiped || 0,
              directoriesWiped: wipeSession.directoriesWiped || 0,
              totalSize: wipeSession.totalSize || 0,
              status: wipeSession.status || 'unknown',
              startTime: wipeSession.startTime,
              endTime: wipeSession.endTime,
              settings: wipeSession.settings || {}
            };
          }
          
          return sessionObj;
        } catch (error) {
          console.error(`Error getting details for session ${session.sessionId}:`, error.message);
          return session.toObject ? session.toObject() : session;
        }
      })
    );

    res.json({
      success: true,
      sessions: detailedSessions,
      count: detailedSessions.length,
      source
    });

  } catch (error) {
    console.error('❌ Error fetching user sessions:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user sessions',
      details: error.message 
    });
  }
});

// Get user backups
app.get('/api/user/backups', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        success: false,
        error: 'Username is required' 
      });
    }

    console.log(`📋 Fetching backups for user: ${username}`);
    
    let backups = [];
    let source = 'memory';

    try {
      // Try to get from MongoDB
      backups = await UserBackup.find({
        $or: [
          { username: username },
          { access: username }
        ]
      }).sort({ createdAt: -1 });
      source = 'mongodb';
      console.log(`✅ Got ${backups.length} backups from MongoDB`);
    } catch (mongoError) {
      console.error('❌ MongoDB query failed:', mongoError.message);
      // Fallback to memory store
      backups = await memoryStore.getUserBackups(username);
      source = 'memory-fallback';
      console.log(`🔄 Using memory store: ${backups.length} backups`);
    }

    const plainBackups = backups.map(backup => 
      backup.toObject ? backup.toObject() : backup
    );

    res.json({
      success: true,
      backups: plainBackups,
      count: plainBackups.length,
      source
    });

  } catch (error) {
    console.error('❌ Error fetching user backups:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user backups',
      details: error.message 
    });
  }
});

// Save user session
app.post('/api/user/session/save', async (req, res) => {
  try {
    const { username, sessionId, certificate = '', logs = '' } = req.body;

    if (!username || !sessionId) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and sessionId are required' 
      });
    }

    console.log(`💾 Saving session: ${sessionId} for user: ${username}`);

    const sessionData = {
      username,
      sessionId,
      certificate,
      logs
    };

    let savedSession;
    let source = 'memory';

    try {
      // Try to save to MongoDB
      savedSession = await UserSession.findOneAndUpdate(
        { sessionId },
        sessionData,
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true 
        }
      );
      source = 'mongodb';
      console.log(`✅ Session saved to MongoDB: ${sessionId}`);
    } catch (mongoError) {
      console.error('❌ MongoDB save failed:', mongoError.message);
      // Fallback to memory store
      savedSession = await memoryStore.saveUserSession(sessionData);
      source = 'memory-fallback';
      console.log(`🔄 Session saved to memory: ${sessionId}`);
    }

    res.json({
      success: true,
      session: savedSession,
      source
    });

  } catch (error) {
    console.error('❌ Error saving user session:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to save session' 
    });
  }
});

// Save user backup
app.post('/api/user/backup/save', async (req, res) => {
  try {
    const { username, sessionId, backupUrls = [], access = [] } = req.body;

    if (!username || !sessionId) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and sessionId are required' 
      });
    }

    console.log(`💾 Saving backup for session: ${sessionId}`);

    const backupData = {
      username,
      sessionId,
      backupUrls,
      access: [...new Set([username, ...access])]
    };

    let savedBackup;
    let source = 'memory';

    try {
      // Try to save to MongoDB
      savedBackup = await UserBackup.findOneAndUpdate(
        { sessionId },
        backupData,
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true 
        }
      );
      source = 'mongodb';
      console.log(`✅ Backup saved to MongoDB: ${sessionId}`);
    } catch (mongoError) {
      console.error('❌ MongoDB save failed:', mongoError.message);
      // Fallback to memory store
      savedBackup = await memoryStore.saveUserBackup(backupData);
      source = 'memory-fallback';
      console.log(`🔄 Backup saved to memory: ${sessionId}`);
    }

    res.json({
      success: true,
      backup: savedBackup,
      source
    });

  } catch (error) {
    console.error('❌ Error saving user backup:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to save backup' 
    });
  }
});

// Share session with other users
app.post('/api/user/session/:sessionId/share', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { username, usersToShare } = req.body;

    if (!username || !usersToShare || !Array.isArray(usersToShare)) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and usersToShare array are required' 
      });
    }

    console.log(`🤝 Sharing session ${sessionId} with ${usersToShare.length} users`);

    let result;
    let source = 'memory';

    try {
      // Try to update in MongoDB
      const userBackup = await UserBackup.findOne({
        sessionId,
        username: username
      });

      if (!userBackup) {
        return res.status(403).json({ 
          success: false,
          error: 'You do not own this session' 
        });
      }

      const newAccess = [...new Set([...userBackup.access, ...usersToShare])];
      userBackup.access = newAccess;
      await userBackup.save();

      result = {
        success: true,
        message: `Session shared with ${usersToShare.length} user(s)`,
        sessionId,
        access: userBackup.access
      };
      source = 'mongodb';
    } catch (mongoError) {
      console.error('❌ MongoDB share failed:', mongoError.message);
      // Fallback to memory store
      const memoryResult = await memoryStore.shareSession(sessionId, username, usersToShare);
      
      if (!memoryResult) {
        return res.status(403).json({ 
          success: false,
          error: 'You do not own this session' 
        });
      }

      result = {
        success: true,
        message: `Session shared with ${usersToShare.length} user(s)`,
        sessionId,
        access: memoryResult.access
      };
      source = 'memory-fallback';
    }

    res.json({
      ...result,
      source
    });

  } catch (error) {
    console.error('❌ Error sharing session:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to share session' 
    });
  }
});

// Add these simple endpoints to your server.js
// Remove all the complex code and just add these:

// SIMPLE: Get user sessions
app.get('/api/user/sessions-simple', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }

    console.log(`📋 Fetching sessions for: ${username}`);
    
    // Direct MongoDB query - no fallbacks, no complexity
    const sessions = await UserSession.find({ username: username })
      .sort({ createdAt: -1 })
      .lean(); // Convert to plain objects
    
    console.log(`✅ Found ${sessions.length} sessions`);
    
    res.json({
      success: true,
      sessions: sessions,
      count: sessions.length
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// SIMPLE: Get user backups
app.get('/api/user/backups-simple', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }

    console.log(`📋 Fetching backups for: ${username}`);
    
    // Direct MongoDB query
    const backups = await UserBackup.find({
      $or: [
        { username: username },
        { access: username }
      ]
    })
    .sort({ createdAt: -1 })
    .lean();
    
    console.log(`✅ Found ${backups.length} backups`);
    
    res.json({
      success: true,
      backups: backups,
      count: backups.length
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Test endpoint to verify data exists
app.get('/api/user/test-data', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }
    
    // Check if user has any data
    const sessionCount = await UserSession.countDocuments({ username: username });
    const backupCount = await UserBackup.countDocuments({ 
      $or: [
        { username: username },
        { access: username }
      ]
    });
    
    // Get one sample document
    const sampleSession = await UserSession.findOne({ username: username }).lean();
    const sampleBackup = await UserBackup.findOne({ 
      $or: [
        { username: username },
        { access: username }
      ]
    }).lean();
    
    res.json({
      success: true,
      username,
      sessionCount,
      backupCount,
      sampleSession,
      sampleBackup,
      message: sampleSession || sampleBackup ? 'Data found' : 'No data found for user'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add these endpoints to your server.js

// Store certificate to S3
app.post('/api/certificate/store', async (req, res) => {
  try {
    const { sessionId, username } = req.body;
    
    if (!sessionId || !username) {
      return res.status(400).json({ 
        success: false,
        error: 'Session ID and username are required' 
      });
    }
    
    console.log(`📄 Generating and storing certificate for session: ${sessionId}`);
    
    // Get session data
    let session = wipeSessions.get(sessionId);
    if (!session) {
      session = await loadSessionFromFile(sessionId);
    }
    
    if (!session) {
      return res.status(404).json({ 
        success: false,
        error: 'Session not found' 
      });
    }
    
    if (session.status !== 'completed') {
      return res.status(400).json({ 
        success: false,
        error: 'Wipe process not completed yet' 
      });
    }
    
    // Generate PDF certificate
    const pdfBuffer = await generateCertificate(session);
    
    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `certificate-${sessionId}-${timestamp}.pdf`;
    
    // Save PDF to temporary file
    const tempFilePath = path.join(SESSIONS_DIR, fileName);
    await fs.writeFile(tempFilePath, pdfBuffer);
    
    // Upload to S3
    const s3Result = await s3Service.uploadToS3(tempFilePath, fileName);
    
    if (!s3Result.success) {
      throw new Error('Failed to upload certificate to S3');
    }
    
    // Clean up temp file
    await fs.remove(tempFilePath);
    
    // Store in MongoDB
    const sessionData = {
      username: username,
      sessionId: sessionId,
      certificateUrl: s3Result.s3Url,
      certificateFile: fileName,
      createdAt: new Date(),
      filesWiped: session.filesWiped || 0,
      directoriesWiped: session.directoriesWiped || 0,
      totalSize: session.totalSize || 0,
      status: session.status
    };
    
    // Save to MongoDB
    const savedSession = await UserSession.findOneAndUpdate(
      { sessionId: sessionId },
      sessionData,
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true 
      }
    );
    
    console.log(`✅ Certificate stored in S3 and MongoDB for session: ${sessionId}`);
    
    res.json({
      success: true,
      certificateUrl: s3Result.s3Url,
      fileName: fileName,
      mongoId: savedSession._id,
      session: {
        id: sessionId,
        username: username,
        status: session.status,
        filesWiped: session.filesWiped || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Error storing certificate:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to store certificate',
      details: error.message 
    });
  }
});

// Store logs to S3
app.post('/api/logs/store', async (req, res) => {
  try {
    const { sessionId, username } = req.body;
    
    if (!sessionId || !username) {
      return res.status(400).json({ 
        success: false,
        error: 'Session ID and username are required' 
      });
    }
    
    console.log(`📝 Generating and storing logs for session: ${sessionId}`);
    
    // Get session data
    let session = wipeSessions.get(sessionId);
    if (!session) {
      session = await loadSessionFromFile(sessionId);
    }
    
    if (!session) {
      return res.status(404).json({ 
        success: false,
        error: 'Session not found' 
      });
    }
    
    // Generate log content
    const logContent = generateLogContent(session);
    
    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `logs-${sessionId}-${timestamp}.txt`;
    
    // Save logs to temporary file
    const tempFilePath = path.join(SESSIONS_DIR, fileName);
    await fs.writeFile(tempFilePath, logContent);
    
    // Upload to S3
    const s3Result = await s3Service.uploadToS3(tempFilePath, fileName);
    
    if (!s3Result.success) {
      throw new Error('Failed to upload logs to S3');
    }
    
    // Clean up temp file
    await fs.remove(tempFilePath);
    
    // Update MongoDB
    const updateData = {
      logsUrl: s3Result.s3Url,
      logsFile: fileName,
      updatedAt: new Date()
    };
    
    const updatedSession = await UserSession.findOneAndUpdate(
      { sessionId: sessionId, username: username },
      updateData,
      { new: true }
    );
    
    if (!updatedSession) {
      return res.status(404).json({ 
        success: false,
        error: 'Session not found in database' 
      });
    }
    
    console.log(`✅ Logs stored in S3 and MongoDB for session: ${sessionId}`);
    
    res.json({
      success: true,
      logsUrl: s3Result.s3Url,
      fileName: fileName,
      sessionId: sessionId,
      contentLength: logContent.length
    });
    
  } catch (error) {
    console.error('❌ Error storing logs:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to store logs',
      details: error.message 
    });
  }
});

// Get certificate from S3 via MongoDB reference
app.get('/api/certificate/download/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }
    
    // Find session in MongoDB
    const sessionData = await UserSession.findOne({ 
      sessionId: sessionId,
      username: username 
    });
    
    if (!sessionData) {
      return res.status(404).json({ 
        error: 'Certificate not found for this user' 
      });
    }
    
    if (!sessionData.certificateUrl) {
      return res.status(404).json({ 
        error: 'Certificate URL not available' 
      });
    }
    
    // Return the S3 URL for direct download
    res.json({
      success: true,
      certificateUrl: sessionData.certificateUrl,
      fileName: sessionData.certificateFile || `certificate-${sessionId}.pdf`,
      sessionId: sessionId,
      uploadedAt: sessionData.createdAt
    });
    
  } catch (error) {
    console.error('Error getting certificate:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve certificate' 
    });
  }
});

// Get logs from S3 via MongoDB reference
app.get('/api/logs/download/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        error: 'Username is required' 
      });
    }
    
    // Find session in MongoDB
    const sessionData = await UserSession.findOne({ 
      sessionId: sessionId,
      username: username 
    });
    
    if (!sessionData) {
      return res.status(404).json({ 
        error: 'Logs not found for this user' 
      });
    }
    
    if (!sessionData.logsUrl) {
      return res.status(404).json({ 
        error: 'Logs URL not available' 
      });
    }
    
    // Return the S3 URL for direct download
    res.json({
      success: true,
      logsUrl: sessionData.logsUrl,
      fileName: sessionData.logsFile || `logs-${sessionId}.txt`,
      sessionId: sessionId,
      uploadedAt: sessionData.updatedAt || sessionData.createdAt
    });
    
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve logs' 
    });
  }
});

// Get user sessions with S3 URLs
app.get('/api/user/sessions/with-urls', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        success: false,
        error: 'Username is required' 
      });
    }
    
    // Get user sessions from MongoDB
    const sessions = await UserSession.find({ username: username })
      .sort({ createdAt: -1 })
      .lean();
    
    // Enhance with wipe session details if available
    const enhancedSessions = sessions.map(session => {
      const wipeSession = wipeSessions.get(session.sessionId);
      
      return {
        ...session,
        wipeDetails: wipeSession ? {
          filesWiped: wipeSession.filesWiped,
          directoriesWiped: wipeSession.directoriesWiped,
          totalSize: wipeSession.totalSize,
          status: wipeSession.status,
          startTime: wipeSession.startTime,
          endTime: wipeSession.endTime
        } : null,
        hasCertificate: !!session.certificateUrl,
        hasLogs: !!session.logsUrl
      };
    });
    
    res.json({
      success: true,
      sessions: enhancedSessions,
      count: enhancedSessions.length
    });
    
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch sessions' 
    });
  }
});


// Add this endpoint to check auto-upload status
app.get('/api/wipe/auto-upload-status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Check in memory
    if (wipeSessions.has(sessionId)) {
      const session = wipeSessions.get(sessionId);
      
      const response = {
        sessionId,
        status: session.status,
        autoUploaded: session.autoUploaded || false,
        autoUploadFailed: session.autoUploadFailed || false,
        certificateUrl: session.certificateUrl,
        logsUrl: session.logsUrl,
        mongoId: session.mongoId,
        autoUploadTime: session.autoUploadTime
      };
      
      if (session.autoUploadError) {
        response.autoUploadError = session.autoUploadError;
      }
      
      return res.json(response);
    }
    
    // Check in file storage
    const session = await loadSessionFromFile(sessionId);
    if (session) {
      return res.json({
        sessionId,
        status: session.status,
        autoUploaded: session.autoUploaded || false,
        certificateUrl: session.certificateUrl,
        logsUrl: session.logsUrl,
        mongoId: session.mongoId,
        fromFile: true
      });
    }
    
    // Check in MongoDB
    const mongoSession = await UserSession.findOne({ sessionId: sessionId });
    if (mongoSession) {
      return res.json({
        sessionId,
        status: mongoSession.status,
        certificateUrl: mongoSession.certificateUrl,
        logsUrl: mongoSession.logsUrl,
        filesWiped: mongoSession.filesWiped,
        directoriesWiped: mongoSession.directoriesWiped,
        fromMongoDB: true,
        uploadedAt: mongoSession.createdAt
      });
    }
    
    res.status(404).json({ 
      error: 'Session not found',
      sessionId 
    });
    
  } catch (error) {
    console.error('Error checking auto-upload status:', error);
    res.status(500).json({ 
      error: 'Failed to check auto-upload status',
      details: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Start server with error handling
const server = app.listen(PORT, () => {
  console.log(`🚀 SecureWipe backend server running on port ${PORT}`);
  console.log(`📁 Base directory: ${BASE_DIRECTORY}`);
  console.log(`📁 Sessions directory: ${SESSIONS_DIR}`);
  
  if (!fs.existsSync(BASE_DIRECTORY)) {
    console.warn(`⚠️ WARNING: Base directory does not exist: ${BASE_DIRECTORY}`);
    console.warn('Please create the directory or update BASE_DIRECTORY in server.js');
    console.warn(`You can create it with: mkdir -p "${BASE_DIRECTORY}"`);
  } else {
    console.log(`✅ Base directory exists and is accessible`);
  }
  
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    console.log(`✅ Created sessions directory: ${SESSIONS_DIR}`);
  }
  
  logger.info(`Server started on port ${PORT}`);
  
  setInterval(async () => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const [sessionId, session] of wipeSessions.entries()) {
      if (session.endTime && (now - session.endTime.getTime() > sevenDays)) {
        wipeSessions.delete(sessionId);
        completedNotifications.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old sessions from memory`);
    }
  }, 6 * 60 * 60 * 1000);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} is already in use!`);
    console.error(`\n💡 Solutions:`);
    console.error(`   1. Kill the process using the port:`);
    console.error(`      Windows: netstat -ano | findstr :${PORT}`);
    console.error(`               taskkill /PID <PID> /F`);
    console.error(`      Linux/Mac: lsof -ti:${PORT} | xargs kill -9`);
    console.error(`   2. Use a different port by setting PORT in .env file`);
    console.error(`   3. The process might be a zombie from a previous run\n`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});

// Graceful shutdown handlers
const gracefulShutdown = (signal) => {
  console.log(`\n⚠️  ${signal} received. Gracefully shutting down...`);
  
  server.close(() => {
    console.log('✅ Server closed. Cleaning up...');
    
    // Clean up any active operations
    wipeSessions.clear();
    completedNotifications.clear();
    
    console.log('✅ Cleanup complete. Exiting process.');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;