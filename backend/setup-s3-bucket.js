// setup-s3-bucket.js
const AWS = require('aws-sdk');
require('dotenv').config();

async function setupBucket() {
  console.log('🚀 Setting up AWS S3 Bucket\n');
  
  // Check environment variables
  const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\n💡 Add them to your .env file:');
    console.error('   AWS_ACCESS_KEY_ID=your_access_key');
    console.error('   AWS_SECRET_ACCESS_KEY=your_secret_key');
    console.error('   AWS_S3_BUCKET=your-bucket-name');
    console.error('   AWS_REGION=us-east-1 (optional)\n');
    return;
  }
  
  const config = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  };
  
  const bucketName = process.env.AWS_S3_BUCKET;
  
  console.log('Configuration:');
  console.log(`   Region: ${config.region}`);
  console.log(`   Bucket: ${bucketName}`);
  console.log(`   Access Key: ${config.accessKeyId.substring(0, 8)}...\n`);
  
  AWS.config.update(config);
  const s3 = new AWS.S3();
  
  try {
    // Check if bucket exists
    console.log('🔍 Checking if bucket exists...');
    try {
      await s3.headBucket({ Bucket: bucketName }).promise();
      console.log(`✅ Bucket "${bucketName}" already exists\n`);
      
      // List existing buckets
      const data = await s3.listBuckets().promise();
      console.log('Available buckets:');
      data.Buckets.forEach(b => console.log(`   - ${b.Name}`));
      
    } catch (headError) {
      if (headError.code === 'NotFound') {
        console.log(`📦 Creating bucket "${bucketName}"...`);
        
        const params = {
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: config.region
          }
        };
        
        // us-east-1 is special
        if (config.region === 'us-east-1') {
          delete params.CreateBucketConfiguration;
        }
        
        await s3.createBucket(params).promise();
        console.log(`✅ Bucket "${bucketName}" created successfully!\n`);
        
        // Add CORS configuration
        console.log('🔧 Setting up CORS policy...');
        const corsParams = {
          Bucket: bucketName,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3000
              }
            ]
          }
        };
        
        await s3.putBucketCors(corsParams).promise();
        console.log('✅ CORS policy configured\n');
        
      } else {
        throw headError;
      }
    }
    
    // Test bucket access
    console.log('🧪 Testing bucket access...');
    const testKey = `test-connection-${Date.now()}.txt`;
    const testParams = {
      Bucket: bucketName,
      Key: testKey,
      Body: 'Test connection successful!',
      ContentType: 'text/plain'
    };
    
    await s3.putObject(testParams).promise();
    console.log('✅ Write test passed');
    
    // Clean up test file
    await s3.deleteObject({ Bucket: bucketName, Key: testKey }).promise();
    console.log('✅ Cleanup test passed\n');
    
    console.log('🎉 S3 Bucket setup completed successfully!');
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Your bucket is ready: ${bucketName}`);
    console.log(`   2. Files will be uploaded to: s3://${bucketName}/backups/`);
    console.log(`   3. Access via: https://${bucketName}.s3.amazonaws.com/backups/`);
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(`   Error code: ${error.code}`);
    
    if (error.code === 'InvalidAccessKeyId') {
      console.error('\n💡 Solution: Check your AWS_ACCESS_KEY_ID');
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error('\n💡 Solution: Check your AWS_SECRET_ACCESS_KEY');
    } else if (error.code === 'AccessDenied') {
      console.error('\n💡 Solution: Your IAM user needs S3 permissions');
    }
  }
}

setupBucket();