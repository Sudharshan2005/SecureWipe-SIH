// backend/s3-service.js - Updated for your AWS account
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// Your AWS Configuration
const S3_CONFIG = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'ap-south-1', // Mumbai region
  bucket: process.env.AWS_S3_BUCKET || 'secure-wipe-backup-612703022751'
};

// Initialize S3 client
let s3 = null;

function initializeS3() {
  // Check for credentials
  if (!S3_CONFIG.accessKeyId || !S3_CONFIG.secretAccessKey) {
    console.log('ℹ️  AWS credentials not found. Using simulation mode.');
    console.log('ℹ️  To use real S3, add credentials to .env file');
    return false;
  }
  
  try {
    console.log('🔐 Initializing S3 with:');
    console.log(`   Region: ${S3_CONFIG.region}`);
    console.log(`   Bucket: ${S3_CONFIG.bucket}`);
    
    AWS.config.update({
      accessKeyId: S3_CONFIG.accessKeyId,
      secretAccessKey: S3_CONFIG.secretAccessKey,
      region: S3_CONFIG.region
    });
    
    s3 = new AWS.S3();
    
    // Test connection
    s3.listBuckets({}, (err, data) => {
      if (err) {
        console.error('❌ S3 connection failed:', err.message);
        console.log('ℹ️  Switching to simulation mode');
      } else {
        console.log('✅ S3 connected successfully!');
        console.log(`✅ Available buckets: ${data.Buckets.map(b => b.Name).join(', ')}`);
        
        // Verify our bucket exists
        const bucketExists = data.Buckets.some(b => b.Name === S3_CONFIG.bucket);
        if (!bucketExists) {
          console.warn(`⚠️  Bucket "${S3_CONFIG.bucket}" not found. Please create it in AWS Console.`);
          console.log(`ℹ️  Using simulation mode for now`);
        } else {
          console.log(`✅ Bucket "${S3_CONFIG.bucket}" found and accessible`);
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error('❌ S3 initialization error:', error.message);
    return false;
  }
}

// Check if S3 is available
const isS3Available = initializeS3();

/**
 * Upload file to S3 with your configuration
 */
async function uploadToS3(filePath, fileName, password = null) {
  try {
    // Read file content
    const fileContent = await fs.readFile(filePath);
    const fileSize = fileContent.length;
    
    console.log(`📤 Uploading: ${fileName} (${Math.round(fileSize/1024)} KB)`);
    
    // Encrypt if password provided
    let uploadContent = fileContent;
    let metadata = {
      'original-filename': fileName,
      'uploaded-at': new Date().toISOString(),
      'file-size': String(fileSize),
      'encrypted': String(!!password),
      'account-id': '612703022751'
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
    
    // Upload to S3 if available
    if (isS3Available && s3) {
      const params = {
        Bucket: S3_CONFIG.bucket,
        Key: fileKey,
        Body: uploadContent,
        ContentType: 'application/octet-stream',
        Metadata: metadata,
        StorageClass: 'STANDARD',
        ServerSideEncryption: 'AES256' // S3 managed encryption
      };
      
      console.log('🚀 Uploading to AWS S3...');
      
      const result = await s3.upload(params).promise();
      
      console.log(`✅ Upload successful: ${result.Location}`);
      
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
          versionId: result.VersionId
        }
      };
    } else {
      // Simulation mode
      console.log('🧪 Using simulation mode (no real S3 upload)');
      
      const simulatedUrl = `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${fileKey}`;
      
      // Save locally for simulation
      const simulationDir = path.join(__dirname, 's3-simulated');
      await fs.ensureDir(simulationDir);
      const simulatedPath = path.join(simulationDir, `${timestamp}-${fileName}`);
      await fs.writeFile(simulatedPath, uploadContent);
      
      console.log(`📁 Saved locally: ${simulatedPath}`);
      
      return {
        success: true,
        fileUrl: simulatedUrl,
        s3Url: simulatedUrl,
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
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    return {
      success: false,
      error: error.message,
      code: error.code,
      details: error
    };
  }
}

/**
 * Generate presigned URL for secure download
 */
async function generatePresignedUrl(fileKey, expiresIn = 3600) {
  if (!isS3Available || !s3) {
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
    
    const url = await s3.getSignedUrlPromise('getObject', params);
    console.log(`🔗 Generated presigned URL (expires in ${expiresIn}s)`);
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
  if (!isS3Available || !s3) {
    return { files: [], isRealS3: false };
  }
  
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Prefix: 'secure-wipe-backups/'
    };
    
    const data = await s3.listObjectsV2(params).promise();
    
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
  if (!isS3Available || !s3) {
    console.log('ℹ️  S3 not available, skipping delete');
    return { success: false, error: 'S3 not available' };
  }
  
  try {
    const params = {
      Bucket: S3_CONFIG.bucket,
      Key: fileKey
    };
    
    await s3.deleteObject(params).promise();
    console.log(`🗑️  Deleted from S3: ${fileKey}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting from S3:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  uploadToS3,
  generatePresignedUrl,
  listS3Files,
  deleteS3File,
  isS3Available: () => isS3Available,
  getConfig: () => S3_CONFIG
};