// backend/s3-service.js - COMPLETE FIXED VERSION
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config()

// Your AWS Configuration
const S3_CONFIG = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.AWS_S3_BUCKET || 'secure-wipe-backups'
};

// Initialize S3 client
let s3 = null;
let s3Connected = false;
let s3Initializing = false;
let s3InitPromise = null;

/**
 * Synchronous initialization wrapper
 */
function initializeS3() {
  console.log('🔐 Initializing AWS S3 connection...');
  
  // Check for credentials
  if (!S3_CONFIG.accessKeyId || !S3_CONFIG.secretAccessKey) {
    console.log('❌ AWS credentials not found in environment variables');
    console.log('ℹ️  Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in .env file');
    console.log('ℹ️  Using simulation mode for now');
    s3Connected = false;
    return false;
  }
  
  try {
    console.log('📋 S3 Configuration:');
    console.log(`   Access Key ID: ${S3_CONFIG.accessKeyId.substring(0, 8)}...`);
    console.log(`   Region: ${S3_CONFIG.region}`);
    console.log(`   Bucket: ${S3_CONFIG.bucket}`);
    
    // Configure AWS SDK
    AWS.config.update({
      accessKeyId: S3_CONFIG.accessKeyId,
      secretAccessKey: S3_CONFIG.secretAccessKey,
      region: S3_CONFIG.region,
      signatureVersion: 'v4'
    });
    
    s3 = new AWS.S3();
    
    // Return true for now, actual connection will be tested when needed
    s3Connected = true;
    console.log('✅ S3 client initialized (connection will be tested on first use)');
    return true;
    
  } catch (error) {
    console.error('❌ S3 initialization error:', error.message);
    s3Connected = false;
    return false;
  }
}

/**
 * Test S3 connection asynchronously
 */
async function testS3Connection() {
  if (!s3Connected || !s3) {
    console.log('ℹ️  S3 not initialized');
    return false;
  }
  
  try {
    console.log('🔄 Testing S3 connection...');
    const data = await s3.listBuckets({}).promise();
    
    console.log('✅ S3 connected successfully!');
    console.log(`✅ Available buckets: ${data.Buckets.map(b => b.Name).join(', ')}`);
    
    // Verify our bucket exists
    const bucketExists = data.Buckets.some(b => b.Name === S3_CONFIG.bucket);
    if (!bucketExists) {
      console.warn(`⚠️  Bucket "${S3_CONFIG.bucket}" not found in your AWS account.`);
      console.log(`ℹ️  You may need to create it manually in AWS Console`);
      return false;
    } else {
      console.log(`✅ Bucket "${S3_CONFIG.bucket}" found and accessible`);
      return true;
    }
  } catch (error) {
    console.error('❌ S3 connection test failed:', error.code, error.message);
    s3Connected = false; // Mark as disconnected
    return false;
  }
}

/**
 * Initialize S3 with connection test
 */
async function initializeS3WithTest() {
  if (s3Initializing && s3InitPromise) {
    return s3InitPromise;
  }
  
  s3Initializing = true;
  s3InitPromise = (async () => {
    const initialized = initializeS3();
    if (!initialized) {
      s3Initializing = false;
      return false;
    }
    
    const connected = await testS3Connection();
    s3Connected = connected;
    s3Initializing = false;
    return connected;
  })();
  
  return s3InitPromise;
}

// Initialize S3 connection synchronously (basic initialization)
initializeS3();

/**
 * Upload file to S3 with detailed logging
 */
async function uploadToS3(filePath, fileName, password = null) {
  try {
    // First check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return {
        success: false,
        error: `File not found: ${filePath}`,
        isRealS3: false
      };
    }
    
    const fileContent = await fs.readFile(filePath);
    const fileSize = fileContent.length;
    
    console.log(`📤 Preparing upload: ${fileName} (${formatBytes(fileSize)})`);
    console.log(`   Source path: ${filePath}`);
    
    // Test connection if not already tested
    const connectionTested = await testS3Connection();
    
    // Encrypt if password provided
    let uploadContent = fileContent;
    let metadata = {
      'original-filename': fileName,
      'uploaded-at': new Date().toISOString(),
      'file-size': String(fileSize),
      'encrypted': String(!!password)
    };
    
    if (password) {
      console.log('🔒 Encrypting file with password...');
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(password, 'salt', 32);
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(fileContent.toString('base64'), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      uploadContent = Buffer.from(JSON.stringify({
        encrypted: true,
        content: encrypted,
        iv: iv.toString('hex'),
        algorithm: algorithm
      }));
      
      metadata['encryption-iv'] = iv.toString('hex');
      metadata['encryption-algorithm'] = algorithm;
      metadata['encrypted-size'] = String(uploadContent.length);
    }
    
    // Generate unique file key
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(4).toString('hex');
    const fileKey = `secure-wipe-backups/${timestamp}-${randomId}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    
    console.log(`📁 S3 Key: ${fileKey}`);
    console.log(`📁 Target bucket: ${S3_CONFIG.bucket}`);
    console.log(`📁 Target region: ${S3_CONFIG.region}`);
    
    // Check if S3 is available
    if (!s3Connected || !s3 || !connectionTested) {
      console.log('🧪 S3 not available, using simulation mode');
      
      // Create simulation directory if it doesn't exist
      const simulationDir = path.join(__dirname, 's3-simulated');
      await fs.ensureDir(simulationDir);
      
      const simulatedPath = path.join(simulationDir, `${timestamp}-${fileName}`);
      await fs.writeFile(simulatedPath, uploadContent);
      
      console.log(`📁 Saved locally to: ${simulatedPath}`);
      
      return {
        success: true,
        fileUrl: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${fileKey}`,
        s3Url: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${fileKey}`,
        fileKey: fileKey,
        fileName: fileName,
        encrypted: !!password,
        size: fileSize,
        uploadedAt: new Date().toISOString(),
        region: S3_CONFIG.region,
        bucket: S3_CONFIG.bucket,
        isRealS3: false,
        simulatedPath: simulatedPath,
        note: 'S3 simulation - File saved locally'
      };
    }
    
    // Upload to real S3
    console.log('🚀 Uploading to AWS S3...');
    
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: fileKey,
      Body: uploadContent,
      ContentType: 'application/octet-stream',
      Metadata: metadata,
      StorageClass: 'STANDARD',
      ServerSideEncryption: 'AES256'
    };
    
    console.log('🔄 Upload parameters:');
    console.log(`   Bucket: ${params.Bucket}`);
    console.log(`   Key: ${params.Key}`);
    console.log(`   Size: ${uploadContent.length} bytes`);
    
    // Upload with progress tracking
    const result = await s3.upload(params).promise();
    
    console.log('✅ Upload successful!');
    console.log(`   Location: ${result.Location}`);
    console.log(`   ETag: ${result.ETag}`);
    console.log(`   Version ID: ${result.VersionId || 'None'}`);
    
    return {
      success: true,
      fileUrl: result.Location,
      s3Url: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${fileKey}`,
      fileKey: fileKey,
      fileName: fileName,
      encrypted: !!password,
      size: fileSize,
      uploadedAt: new Date().toISOString(),
      region: S3_CONFIG.region,
      bucket: S3_CONFIG.bucket,
      isRealS3: true,
      details: {
        etag: result.ETag,
        versionId: result.VersionId,
        location: result.Location
      }
    };
    
  } catch (error) {
    console.error('❌ Upload error details:');
    console.error(`   Error code: ${error.code}`);
    console.error(`   Error message: ${error.message}`);
    console.error(`   Request ID: ${error.requestId || 'N/A'}`);
    console.error(`   Status code: ${error.statusCode || 'N/A'}`);
    
    // Provide helpful error messages
    let errorMsg = error.message;
    if (error.code === 'InvalidAccessKeyId') {
      errorMsg = 'Invalid AWS Access Key ID. Please check your credentials.';
    } else if (error.code === 'SignatureDoesNotMatch') {
      errorMsg = 'AWS Secret Access Key is incorrect.';
    } else if (error.code === 'NoSuchBucket') {
      errorMsg = `Bucket "${S3_CONFIG.bucket}" does not exist. Please create it in AWS Console.`;
    } else if (error.code === 'AccessDenied') {
      errorMsg = 'Access denied. Check IAM permissions for S3 access.';
    }
    
    return {
      success: false,
      error: errorMsg,
      code: error.code,
      details: error.message,
      isRealS3: false
    };
  }
}

/**
 * Helper function to format bytes
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
 * Generate presigned URL for secure download
 */
async function generatePresignedUrl(fileKey, expiresIn = 3600) {
  if (!s3Connected || !s3) {
    console.log('ℹ️  S3 not available, using simulated URL');
    return `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${fileKey}`;
  }
  
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: fileKey,
      Expires: expiresIn,
      ResponseContentDisposition: `attachment; filename="${fileKey.split('/').pop()}"`
    };
    
    console.log(`🔗 Generating presigned URL for: ${fileKey}`);
    const url = await s3.getSignedUrlPromise('getObject', params);
    console.log(`✅ Presigned URL generated (expires in ${expiresIn}s)`);
    return url;
  } catch (error) {
    console.error('❌ Error generating presigned URL:', error);
    return null;
  }
}

/**
 * List files in S3 bucket
 */
async function listS3Files() {
  if (!s3Connected || !s3) {
    console.log('ℹ️  S3 not available, returning empty list');
    return { files: [], isRealS3: false };
  }
  
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Prefix: 'secure-wipe-backups/'
    };
    
    console.log(`📋 Listing files in bucket: ${S3_CONFIG.bucket}`);
    const data = await s3.listObjectsV2(params).promise();
    
    console.log(`✅ Found ${data.KeyCount || 0} files`);
    return {
      files: data.Contents || [],
      total: data.KeyCount,
      isRealS3: true
    };
  } catch (error) {
    console.error('❌ Error listing S3 files:', error);
    return { files: [], error: error.message };
  }
}

/**
 * Delete file from S3
 */
async function deleteS3File(fileKey) {
  if (!s3Connected || !s3) {
    console.log('ℹ️  S3 not available, skipping delete');
    return { success: false, error: 'S3 not available' };
  }
  
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: fileKey
    };
    
    console.log(`🗑️  Deleting from S3: ${fileKey}`);
    await s3.deleteObject(params).promise();
    console.log(`✅ Deleted: ${fileKey}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting from S3:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check S3 connectivity and bucket permissions
 */
async function checkS3Connection() {
  if (!s3Connected || !s3) {
    return {
      connected: false,
      message: 'S3 not initialized or connected',
      bucket: S3_CONFIG.bucket,
      region: S3_CONFIG.region
    };
  }
  
  try {
    // Check bucket existence and permissions
    await s3.headBucket({ Bucket: S3_CONFIG.bucket }).promise();
    
    // Try to list objects to check read permissions
    await s3.listObjectsV2({ Bucket: S3_CONFIG.bucket, MaxKeys: 1 }).promise();
    
    return {
      connected: true,
      message: 'S3 connection successful',
      bucket: S3_CONFIG.bucket,
      region: S3_CONFIG.region,
      accessible: true
    };
  } catch (error) {
    return {
      connected: false,
      message: `S3 connection error: ${error.message}`,
      bucket: S3_CONFIG.bucket,
      region: S3_CONFIG.region,
      error: error.code
    };
  }
}

/**
 * Download file from S3 (with decryption if needed)
 */
async function downloadFromS3(fileKey, password = null) {
  if (!s3Connected || !s3) {
    console.log('ℹ️  S3 not available, cannot download');
    return { success: false, error: 'S3 not available' };
  }
  
  try {
    console.log(`📥 Downloading from S3: ${fileKey}`);
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: fileKey
    };
    
    const data = await s3.getObject(params).promise();
    
    // Check if file is encrypted
    const metadata = data.Metadata || {};
    const isEncrypted = metadata.encrypted === 'true';
    
    let fileContent = data.Body;
    
    // Decrypt if needed
    if (isEncrypted && password) {
      console.log('🔓 Decrypting file...');
      try {
        const encryptedData = JSON.parse(fileContent.toString());
        const algorithm = encryptedData.algorithm || 'aes-256-cbc';
        const key = crypto.scryptSync(password, 'salt', 32);
        const iv = Buffer.from(encryptedData.iv, 'hex');
        
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedData.content, 'hex', 'base64');
        decrypted += decipher.final('base64');
        
        fileContent = Buffer.from(decrypted, 'base64');
      } catch (decryptError) {
        console.error('❌ Decryption failed:', decryptError.message);
        return { 
          success: false, 
          error: 'Decryption failed. Wrong password or corrupted file.' 
        };
      }
    } else if (isEncrypted && !password) {
      return { 
        success: false, 
        error: 'File is encrypted but no password provided.' 
      };
    }
    
    return {
      success: true,
      content: fileContent,
      metadata: metadata,
      size: fileContent.length,
      encrypted: isEncrypted
    };
    
  } catch (error) {
    console.error('❌ Download error:', error);
    return { 
      success: false, 
      error: `Download failed: ${error.message}` 
    };
  }
}

module.exports = {
  uploadToS3,
  generatePresignedUrl,
  listS3Files,
  deleteS3File,
  downloadFromS3,
  checkS3Connection,
  testS3Connection,
  initializeS3WithTest,
  isS3Available: () => s3Connected,
  getConfig: () => S3_CONFIG,
  formatBytes
};