// backend/s3-service.js - UPDATED VERSION
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config();

// Configuration with better defaults
const S3_CONFIG = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.AWS_S3_BUCKET || 'secure-wipe-backups-' + Date.now(),
  endpoint: process.env.AWS_S3_ENDPOINT, // For local/minio development
  s3ForcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true', // For local/minio
  signatureVersion: 'v4'
};

console.log('🔐 S3 Configuration Loaded:');
console.log(`   Region: ${S3_CONFIG.region}`);
console.log(`   Bucket: ${S3_CONFIG.bucket}`);
console.log(`   Access Key: ${S3_CONFIG.accessKeyId ? '✓ Set' : '✗ Missing'}`);
console.log(`   Secret Key: ${S3_CONFIG.secretAccessKey ? '✓ Set' : '✗ Missing'}`);

// Initialize S3
let s3 = null;
let s3Initialized = false;

function initializeS3() {
  try {
    // Check for minimal credentials
    if (!S3_CONFIG.accessKeyId || !S3_CONFIG.secretAccessKey) {
      console.warn('⚠️  AWS credentials missing. Using local simulation mode.');
      s3Initialized = false;
      return false;
    }
    
    // Configure AWS SDK
    const awsConfig = {
      accessKeyId: S3_CONFIG.accessKeyId,
      secretAccessKey: S3_CONFIG.secretAccessKey,
      region: S3_CONFIG.region,
      signatureVersion: S3_CONFIG.signatureVersion
    };
    
    // Add endpoint for local/minio development
    if (S3_CONFIG.endpoint) {
      awsConfig.endpoint = S3_CONFIG.endpoint;
      awsConfig.s3ForcePathStyle = S3_CONFIG.s3ForcePathStyle;
      console.log(`   Using custom endpoint: ${S3_CONFIG.endpoint}`);
    }
    
    AWS.config.update(awsConfig);
    
    // Create S3 instance with better configuration
    s3 = new AWS.S3({
      maxRetries: 3,
      httpOptions: {
        timeout: 30000,
        connectTimeout: 5000
      }
    });
    
    s3Initialized = true;
    console.log('✅ S3 client initialized successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to initialize S3:', error.message);
    s3Initialized = false;
    return false;
  }
}

// Initialize immediately
initializeS3();

/**
 * Test S3 connection with detailed error reporting
 */
async function testS3Connection() {
  if (!s3Initialized || !s3) {
    console.log('ℹ️  S3 not initialized, attempting to initialize...');
    if (!initializeS3()) {
      return {
        connected: false,
        message: 'S3 client could not be initialized. Check credentials.',
        mode: 'simulation'
      };
    }
  }
  
  try {
    console.log('🔄 Testing S3 connection...');
    
    // First, try a simple operation to check permissions
    const params = {
      Bucket: S3_CONFIG.bucket,
      MaxKeys: 1
    };
    
    // Try to list objects (requires s3:ListBucket permission)
    const data = await s3.listObjectsV2(params).promise();
    
    console.log('✅ S3 connection successful!');
    console.log(`   Bucket: ${S3_CONFIG.bucket}`);
    console.log(`   Region: ${S3_CONFIG.region}`);
    console.log(`   Objects in bucket: ${data.KeyCount || 0}`);
    
    return {
      connected: true,
      message: 'S3 connection successful',
      bucket: S3_CONFIG.bucket,
      region: S3_CONFIG.region,
      objects: data.KeyCount || 0,
      mode: 'real'
    };
    
  } catch (error) {
    console.error('❌ S3 connection test failed:');
    console.error(`   Error Code: ${error.code}`);
    console.error(`   Error Message: ${error.message}`);
    console.error(`   Request ID: ${error.requestId || 'N/A'}`);
    
    // Check specific error codes
    if (error.code === 'InvalidAccessKeyId') {
      console.error('💡 Solution: Check AWS_ACCESS_KEY_ID in .env file');
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error('💡 Solution: Check AWS_SECRET_ACCESS_KEY in .env file');
    } else if (error.code === 'NoSuchBucket') {
      console.error(`💡 Solution: Bucket "${S3_CONFIG.bucket}" doesn't exist. Create it first.`);
      console.error(`   Command: aws s3api create-bucket --bucket ${S3_CONFIG.bucket} --region ${S3_CONFIG.region}`);
    } else if (error.code === 'AccessDenied') {
      console.error('💡 Solution: IAM user lacks S3 permissions. Add S3FullAccess policy.');
    } else if (error.code === 'NetworkingError') {
      console.error('💡 Solution: Check network connection or AWS region.');
    }
    
    return {
      connected: false,
      message: `S3 connection failed: ${error.code || error.message}`,
      error: error.code,
      details: error.message,
      mode: 'simulation'
    };
  }
}

/**
 * Ensure bucket exists, create if not
 */
async function ensureBucketExists() {
  if (!s3Initialized || !s3) {
    console.log('ℹ️  S3 not available, skipping bucket check');
    return false;
  }
  
  try {
    console.log(`📦 Checking if bucket "${S3_CONFIG.bucket}" exists...`);
    
    // Try to head the bucket
    await s3.headBucket({ Bucket: S3_CONFIG.bucket }).promise();
    console.log(`✅ Bucket "${S3_CONFIG.bucket}" exists`);
    return true;
    
  } catch (error) {
    if (error.code === 'NotFound') {
      console.log(`📦 Bucket doesn't exist, creating "${S3_CONFIG.bucket}"...`);
      try {
        const createParams = {
          Bucket: S3_CONFIG.bucket,
          CreateBucketConfiguration: {
            LocationConstraint: S3_CONFIG.region
          }
        };
        
        // us-east-1 is special
        if (S3_CONFIG.region === 'us-east-1') {
          delete createParams.CreateBucketConfiguration;
        }
        
        await s3.createBucket(createParams).promise();
        console.log(`✅ Bucket "${S3_CONFIG.bucket}" created successfully`);
        
        // Wait a moment for bucket to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
        
      } catch (createError) {
        console.error(`❌ Failed to create bucket:`, createError.message);
        return false;
      }
    } else {
      console.error(`❌ Error checking bucket:`, error.message);
      return false;
    }
  }
}

/**
 * Enhanced upload with better error handling and fallback
 */
async function uploadToS3(filePath, fileName, password = null) {
  try {
    console.log(`\n📤 Starting S3 Upload: ${fileName}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const fileStats = fs.statSync(filePath);
    console.log(`   File size: ${formatBytes(fileStats.size)}`);
    
    // Test connection first
    const connectionTest = await testS3Connection();
    
    if (!connectionTest.connected) {
      console.log('🧪 S3 not available, using local simulation');
      return uploadToLocalSimulation(filePath, fileName, password);
    }
    
    // Ensure bucket exists
    const bucketReady = await ensureBucketExists();
    if (!bucketReady) {
      console.log('🧪 Bucket not ready, using local simulation');
      return uploadToLocalSimulation(filePath, fileName, password);
    }
    
    // Read and optionally encrypt file
    let fileContent = fs.readFileSync(filePath);
    let uploadContent = fileContent;
    const metadata = {
      'original-filename': fileName,
      'uploaded-at': new Date().toISOString(),
      'file-size': String(fileStats.size),
      'encrypted': String(!!password)
    };
    
    if (password) {
      console.log('🔒 Encrypting with AES-256...');
      const encryptedData = encryptFile(fileContent, password);
      uploadContent = Buffer.from(JSON.stringify(encryptedData));
      metadata['encryption-algorithm'] = 'aes-256-gcm';
    }
    
    // Generate unique key
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(4).toString('hex');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `backups/${timestamp}_${randomId}_${safeFileName}`;
    
    console.log(`   S3 Key: ${fileKey}`);
    console.log(`   Uploading to: ${S3_CONFIG.bucket}`);
    
    // Upload parameters
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: fileKey,
      Body: uploadContent,
      ContentType: 'application/octet-stream',
      Metadata: metadata,
      StorageClass: 'STANDARD',
      ServerSideEncryption: 'AES256'
    };
    
    // Upload with progress
    console.log('🔄 Uploading... (this may take a moment)');
    const startTime = Date.now();
    
    const uploadPromise = s3.upload(params).promise();
    
    // Add a simple progress indicator
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`   Still uploading... ${elapsed.toFixed(1)}s elapsed`);
    }, 3000);
    
    const result = await uploadPromise;
    clearInterval(progressInterval);
    
    const uploadTime = (Date.now() - startTime) / 1000;
    console.log(`✅ Upload completed in ${uploadTime.toFixed(2)} seconds`);
    console.log(`   ETag: ${result.ETag}`);
    console.log(`   Location: ${result.Location}`);
    
    return {
      success: true,
      fileUrl: result.Location,
      s3Url: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${fileKey}`,
      fileKey: fileKey,
      fileName: fileName,
      encrypted: !!password,
      size: fileStats.size,
      uploadedAt: new Date().toISOString(),
      region: S3_CONFIG.region,
      bucket: S3_CONFIG.bucket,
      isRealS3: true,
      details: {
        etag: result.ETag,
        versionId: result.VersionId
      }
    };
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    console.error('   Error details:', error.code || 'Unknown');
    
    // Fallback to local simulation
    console.log('🔄 Falling back to local simulation...');
    return uploadToLocalSimulation(filePath, fileName, password);
  }
}

/**
 * Local simulation for development/testing
 */
async function uploadToLocalSimulation(filePath, fileName, password = null) {
  try {
    console.log('🧪 Using local simulation mode');
    
    // Create simulation directory
    const simulationDir = path.join(__dirname, 's3-simulated');
    await fs.ensureDir(simulationDir);
    
    // Read file
    const fileContent = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(4).toString('hex');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localFileName = `${timestamp}_${randomId}_${safeFileName}`;
    const localPath = path.join(simulationDir, localFileName);
    
    // Save locally
    await fs.writeFile(localPath, fileContent);
    
    console.log(`📁 Saved locally: ${localPath}`);
    
    return {
      success: true,
      fileUrl: `file://${localPath}`,
      s3Url: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/simulated/${localFileName}`,
      fileKey: `simulated/${localFileName}`,
      fileName: fileName,
      encrypted: !!password,
      size: fileStats.size,
      uploadedAt: new Date().toISOString(),
      region: S3_CONFIG.region,
      bucket: S3_CONFIG.bucket,
      isRealS3: false,
      simulatedPath: localPath,
      note: 'Development mode - File saved locally'
    };
    
  } catch (error) {
    console.error('❌ Local simulation failed:', error);
    return {
      success: false,
      error: `Both S3 and local backup failed: ${error.message}`,
      isRealS3: false
    };
  }
}

/**
 * Encrypt file content
 */
function encryptFile(content, password) {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(password, 'secure-wipe-salt', 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(content.toString('base64'), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: true,
    content: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    algorithm: algorithm
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Generate presigned URL
 */
async function generatePresignedUrl(fileKey, expiresIn = 3600) {
  if (!s3Initialized || !s3) {
    console.log('ℹ️  S3 not available for presigned URL');
    return null;
  }
  
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: fileKey,
      Expires: expiresIn
    };
    
    return await s3.getSignedUrlPromise('getObject', params);
  } catch (error) {
    console.error('Presigned URL error:', error);
    return null;
  }
}

/**
 * Check S3 connection status
 */
async function checkS3Connection() {
  return testS3Connection();
}

/**
 * List files in bucket
 */
async function listS3Files() {
  if (!s3Initialized || !s3) {
    return { files: [], isRealS3: false };
  }
  
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Prefix: 'backups/'
    };
    
    const data = await s3.listObjectsV2(params).promise();
    return {
      files: data.Contents || [],
      total: data.KeyCount,
      isRealS3: true
    };
  } catch (error) {
    console.error('List files error:', error);
    return { files: [], error: error.message };
  }
}

// Export functions
module.exports = {
  uploadToS3,
  generatePresignedUrl,
  listS3Files,
  checkS3Connection,
  testS3Connection,
  ensureBucketExists,
  isS3Available: () => s3Initialized,
  getConfig: () => S3_CONFIG,
  formatBytes
};