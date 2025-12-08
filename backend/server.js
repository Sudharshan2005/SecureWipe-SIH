const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const winston = require('winston');
const os = require('os');
const s3Service = require('./s3-service');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

/**
 * Format bytes to human readable
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Save session to file for persistence
 */
async function saveSessionToFile(sessionId, session) {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    const sessionToSave = {
      ...session,
      savedAt: new Date().toISOString(),
      fromFile: true
    };
    
    // Create a clean copy without circular references or non-serializable data
    const cleanSession = JSON.parse(JSON.stringify(sessionToSave, (key, value) => {
      // Remove any non-serializable values
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
    
    // Write to a temporary file first, then rename (atomic operation)
    const tempFilePath = filePath + '.tmp';
    await fs.writeFile(tempFilePath, JSON.stringify(cleanSession, null, 2), 'utf8');
    
    // Atomically replace the old file
    await fs.rename(tempFilePath, filePath);
    
    logger.info(`Session ${sessionId} saved to file`);
    return true;
  } catch (error) {
    logger.error(`Failed to save session ${sessionId} to file:`, error);
    return false;
  }
}

/**
 * Load session from file
 */
async function loadSessionFromFile(sessionId) {
  try {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (!(await fs.pathExists(filePath))) {
      return null;
    }
    
    // Read and parse the file
    const fileContent = await fs.readFile(filePath, 'utf8');
    
    // Clean the content - remove any trailing commas or invalid JSON
    let cleanContent = fileContent.trim();
    
    // Remove any trailing commas that might break JSON parsing
    cleanContent = cleanContent.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    
    // Parse the JSON
    const session = JSON.parse(cleanContent, (key, value) => {
      // Restore Date objects
      if (key === 'startTime' || key === 'endTime' || key === 'lastAccessed' || key === 'savedAt') {
        return value ? new Date(value) : null;
      }
      return value;
    });
    
    session.from = 'file storage';
    session.lastAccessed = new Date();
    
    // Validate the session structure
    if (!session.id || !session.status) {
      logger.warn(`Invalid session data in file: ${sessionId}`);
      return null;
    }
    
    return session;
  } catch (error) {
    logger.error(`Failed to load session ${sessionId} from file:`, error.message);
    
    // Try to read and log the corrupted file for debugging
    try {
      const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
      if (await fs.pathExists(filePath)) {
        const badContent = await fs.readFile(filePath, 'utf8');
        logger.error(`Corrupted file content (first 200 chars): ${badContent.substring(0, 200)}`);
        
        // Try to fix the corrupted file
        await fixCorruptedSessionFile(sessionId, filePath, badContent);
      }
    } catch (readError) {
      logger.error('Could not read corrupted file:', readError.message);
    }
    
    return null;
  }
}

async function fixCorruptedSessionFile(sessionId, filePath, content) {
  try {
    // Try to extract valid JSON from the corrupted file
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      const cleanedJson = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/,\s*,/g, ',')
        .replace(/\n\s*\n/g, '\n');
      
      const session = JSON.parse(cleanedJson);
      session.id = sessionId;
      session.status = session.status || 'unknown';
      session.lastAccessed = new Date();
      
      // Save the fixed session
      await saveSessionToFile(sessionId, session);
      logger.info(`Fixed corrupted session file: ${sessionId}`);
      return session;
    }
  } catch (fixError) {
    logger.error(`Failed to fix corrupted session ${sessionId}:`, fixError.message);
    
    // Create a minimal valid session if all else fails
    const minimalSession = {
      id: sessionId,
      status: 'unknown',
      lastAccessed: new Date(),
      from: 'recovered',
      error: 'Session recovered from corruption'
    };
    
    await fs.writeFile(filePath, JSON.stringify(minimalSession, null, 2), 'utf8');
    return minimalSession;
  }
}

/**
 * Validate and sanitize file path
 */
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

/**
 * Check if path exists and is accessible
 */
async function validatePathExists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch (error) {
    logger.warn(`Path does not exist: ${fullPath}`);
    return false;
  }
}

/**
 * Securely wipe a file
 */
async function secureWipeFile(filePath, passes = 7) {
  try {
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    const fd = await fs.open(filePath, 'r+');
    
    const effectivePasses = Math.min(passes, WIPE_PATTERNS.length);
    for (let pass = 0; pass < effectivePasses; pass++) {
      const pattern = WIPE_PATTERNS[pass];
      const bufferSize = 64 * 1024;
      let bytesWritten = 0;
      
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
    }
    
    await fs.close(fd);
    await fs.unlink(filePath);
    
    return {
      success: true,
      size: fileSize,
      passes: effectivePasses
    };
  } catch (error) {
    logger.error(`Error wiping file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Recursively wipe directory - UPDATED VERSION
 */
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
        
        // Remove empty directory
        try {
          await fs.rmdir(fullPath);
          results.directories.push(path.relative(BASE_DIRECTORY, fullPath));
          
          // Update session for directory removal
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
        
        // Update session for file wipe
        if (sessionId && wipeSessions.has(sessionId)) {
          const session = wipeSessions.get(sessionId);
          session.filesWiped = (session.filesWiped || 0) + 1;
          session.lastAccessed = new Date();
          
          // Update total size
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

/**
 * Create wipe session
 */
function createWipeSession(paths, settings) {
  const sessionId = uuidv4();
  const session = {
    id: sessionId,
    paths: paths,
    settings: settings,
    startTime: new Date(),
    status: 'pending',
    filesWiped: 0,
    directoriesWiped: 0,
    totalSize: 0,
    errors: [],
    baseDirectory: BASE_DIRECTORY,
    lastAccessed: new Date(),
    from: 'memory'
  };
  
  wipeSessions.set(sessionId, session);
  
  // Save to file for persistence
  saveSessionToFile(sessionId, session);
  
  return sessionId;
}

/**
 * Update wipe session - IMPROVED VERSION
 */
function updateWipeSession(sessionId, updates) {
  if (wipeSessions.has(sessionId)) {
    const session = wipeSessions.get(sessionId);
    
    // Calculate progress if not provided
    if (!updates.progress && session.totalPaths && (updates.processedPaths !== undefined)) {
      updates.progress = Math.round((updates.processedPaths / session.totalPaths) * 100);
    }
    
    // Make sure we have valid values
    const cleanUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        if (value instanceof Date) {
          cleanUpdates[key] = value.toISOString();
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          // Deep clone objects to prevent circular references
          cleanUpdates[key] = JSON.parse(JSON.stringify(value));
        } else {
          cleanUpdates[key] = value;
        }
      }
    }
    
    // Merge updates
    Object.assign(session, cleanUpdates);
    session.lastAccessed = new Date();
    
    // Save to file, but don't wait for it (non-blocking)
    const importantUpdates = ['status', 'filesWiped', 'directoriesWiped', 'totalSize', 'progress', 'errors', 'endTime'];
    const hasImportantUpdate = Object.keys(updates).some(key => importantUpdates.includes(key));
    
    if (hasImportantUpdate) {
      // Save asynchronously to prevent blocking
      setTimeout(async () => {
        try {
          await saveSessionToFile(sessionId, session);
        } catch (error) {
          logger.error(`Failed to async save session ${sessionId}:`, error.message);
        }
      }, 0);
    }
    
    wipeSessions.set(sessionId, session);
    
    // Log progress updates
    if (updates.progress !== undefined && updates.progress % 25 === 0) {
      logger.info(`Session ${sessionId}: Progress ${updates.progress}% - ${session.filesWiped || 0} files, ${session.directoriesWiped || 0} directories`);
    }
    
    return session;
  }
  return null;
}

/**
 * Generate certificate PDF
 */
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

/**
 * Generate detailed log content
 */
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

/**
 * Get available files and folders
 */
// In your server.js, update the /api/files endpoint:
app.get('/api/files', async (req, res) => {
  try {
    const { path: subPath = '' } = req.query;
    
    let targetPath = BASE_DIRECTORY;
    let relativePath = '';
    
    // Handle subdirectories
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

    // Sort: directories first, then files, then alphabetically
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

/**
 * Start wipe process - UPDATED VERSION
 */
app.post('/api/wipe/start', async (req, res) => {
  try {
    const { paths, settings = {} } = req.body;
    
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'No paths provided' });
    }
    
    // Validate and convert relative paths to full paths
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
    
    const sessionId = createWipeSession(
      validPaths.map(p => p.relativePath),
      settings
    );
    
    // Start wipe process immediately (not in setTimeout)
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
              
              // Try to remove the directory itself
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
          
          // Update progress
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
        
        // Calculate totals
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
    })(); // Immediately invoke the async function
    
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

/**
 * Get wipe status
 */
/**
 * Get wipe status - UPDATED to handle corrupted sessions
 */
app.get('/api/wipe/status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  // Check memory first
  if (wipeSessions.has(sessionId)) {
    const session = wipeSessions.get(sessionId);
    session.lastAccessed = new Date();
    
    // Calculate progress if in progress
    if (session.status === 'in-progress') {
      const totalPaths = session.paths ? session.paths.length : 0;
      const processedPaths = (session.filesWiped || 0) + (session.directoriesWiped || 0);
      session.progress = totalPaths > 0 ? Math.round((processedPaths / totalPaths) * 100) : 0;
    }
    
    // Handle completion notifications
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
  
  // Try to load from file with better error handling
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

/**
 * Download certificate
 */
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

/**
 * Download wipe session logs
 */
app.get('/api/wipe/logs/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    let session = null;
    let source = 'memory';
    
    // 1. Check active sessions
    if (wipeSessions.has(sessionId)) {
      session = wipeSessions.get(sessionId);
      source = 'active memory';
      session.lastAccessed = new Date();
    }
    // 2. Check file storage
    else {
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
    
    // Add source information to session
    session.from = source;
    session.lastAccessed = new Date();
    
    // Generate log content
    const logContent = generateLogContent(session);
    
    // Save updated session
    if (source === 'memory') {
      wipeSessions.set(sessionId, session);
    }
    saveSessionToFile(sessionId, session);
    
    // Send as text file
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

/**
 * Get all available sessions
 */
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

/**
 * Generate wipe script
 */
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

/**
 * Health check
 */
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

/**
 * Get server info
 */
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

/**
 * Clean up old sessions
 */
app.get('/api/cleanup', async (req, res) => {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  let cleanedCount = 0;
  let fileCleanedCount = 0;
  
  // Clean memory sessions
  for (const [sessionId, session] of wipeSessions.entries()) {
    if (session.endTime && (now - session.endTime.getTime() > sevenDays)) {
      wipeSessions.delete(sessionId);
      completedNotifications.delete(sessionId);
      cleanedCount++;
    }
  }
  
  // Clean file sessions
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(SESSIONS_DIR, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > sevenDays) {
          await fs.unlink(filePath);
          fileCleanedCount++;
        }
      }
    }
  } catch (error) {
    logger.error('Error cleaning session files:', error);
  }
  
  res.json({
    message: `Cleaned up ${cleanedCount} memory sessions and ${fileCleanedCount} file sessions`,
    remainingSessions: wipeSessions.size
  });
});

/**
 * Clean up corrupted session files
 */
async function cleanupCorruptedSessions() {
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    let fixedCount = 0;
    let deletedCount = 0;
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const sessionId = file.replace('.json', '');
        const filePath = path.join(SESSIONS_DIR, file);
        
        try {
          // Try to load the session
          const session = await loadSessionFromFile(sessionId);
          if (!session) {
            // Session is corrupted, try to fix it
            logger.warn(`Found corrupted session file: ${file}`);
            const content = await fs.readFile(filePath, 'utf8');
            const fixedSession = await fixCorruptedSessionFile(sessionId, filePath, content);
            
            if (fixedSession) {
              fixedCount++;
              logger.info(`Fixed corrupted session: ${sessionId}`);
            } else {
              // Delete if cannot be fixed and is old
              const stats = await fs.stat(filePath);
              const age = Date.now() - stats.mtimeMs;
              const oneDay = 24 * 60 * 60 * 1000;
              
              if (age > oneDay) {
                await fs.unlink(filePath);
                deletedCount++;
                logger.info(`Deleted corrupted session file: ${file} (age: ${Math.round(age / oneDay)} days)`);
              }
            }
          }
        } catch (error) {
          logger.error(`Error processing session file ${file}:`, error.message);
        }
      }
    }
    
    if (fixedCount > 0 || deletedCount > 0) {
      logger.info(`Session cleanup: Fixed ${fixedCount}, Deleted ${deletedCount} corrupted sessions`);
    }
    
    return { fixedCount, deletedCount };
  } catch (error) {
    logger.error('Error in session cleanup:', error);
    return { fixedCount: 0, deletedCount: 0, error: error.message };
  }
}

// Add a cleanup endpoint
app.get('/api/cleanup-sessions', async (req, res) => {
  try {
    const result = await cleanupCorruptedSessions();
    res.json({
      success: true,
      message: 'Session cleanup completed',
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Cleanup failed',
      message: error.message
    });
  }
});

/**
 * Upload important files to S3 before wipe
 */
app.post('/api/s3/upload', async (req, res) => {
  try {
    const { files, password, sessionId } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files specified' });
    }
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    // Get session to verify
    let session = wipeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const uploadResults = [];
    const errors = [];
    
    for (const fileInfo of files) {
      try {
        const { path: filePath, name: fileName } = fileInfo;
        
        if (!filePath || !fileName) {
          errors.push({ file: fileInfo, error: 'Missing path or name' });
          continue;
        }
        
        // Validate file exists
        const fullPath = path.join(BASE_DIRECTORY, filePath);
        if (!(await fs.pathExists(fullPath))) {
          errors.push({ file: fileInfo, error: 'File not found' });
          continue;
        }
        
        // Upload to S3
        const result = await s3Service.uploadToS3(fullPath, fileName, password);
        
        if (result.success) {
          uploadResults.push({
            originalPath: filePath,
            originalName: fileName,
            s3Url: result.fileUrl,
            s3Key: result.fileKey,
            encrypted: result.encrypted,
            size: result.size,
            uploadedAt: result.uploadedAt,
            isRealS3: result.isRealS3
          });
        } else {
          errors.push({ file: fileInfo, error: result.error });
        }
      } catch (error) {
        errors.push({ file: fileInfo, error: error.message });
      }
    }
    
    // Store upload info in session
    if (uploadResults.length > 0) {
      if (!session.s3Uploads) {
        session.s3Uploads = [];
      }
      session.s3Uploads.push(...uploadResults);
      updateWipeSession(sessionId, { s3Uploads: session.s3Uploads });
    }
    
    res.json({
      success: true,
      uploaded: uploadResults.length,
      failed: errors.length,
      uploads: uploadResults,
      errors: errors,
      sessionId: sessionId,
      note: uploadResults[0]?.isRealS3 ? 'Files uploaded to AWS S3' : 'Files saved locally (S3 simulation)'
    });
    
  } catch (error) {
    logger.error('S3 upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload files',
      details: error.message 
    });
  }
});

/**
 * Get S3 uploads for a session
 */
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
    
    // Get fresh info for each upload
    const uploadsWithInfo = await Promise.all(
      uploads.map(async (upload) => {
        const info = await s3Service.getS3FileInfo(upload.s3Key);
        return {
          ...upload,
          s3Info: info
        };
      })
    );
    
    res.json({
      sessionId,
      totalUploads: uploads.length,
      uploads: uploadsWithInfo
    });
    
  } catch (error) {
    logger.error('Error getting S3 uploads:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get download URL for S3 file
 */
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
    
    // Generate presigned URL if using real S3
    if (upload.isRealS3) {
      const downloadUrl = await s3Service.generatePresignedUrl(upload.s3Key, 3600); // 1 hour expiry
      if (downloadUrl) {
        return res.json({
          downloadUrl,
          fileName: upload.originalName,
          expiresIn: 3600
        });
      }
    }
    
    // For simulated S3, return the local path info
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SecureWipe backend server running on port ${PORT}`);
  console.log(`📁 Base directory: ${BASE_DIRECTORY}`);
  console.log(`📁 Sessions directory: ${SESSIONS_DIR}`);
  
  // Check if base directory exists
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
  
  // Periodic cleanup of old sessions (every 6 hours)
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

module.exports = app;