// test-aws-credentials.js
const AWS = require('aws-sdk');
require('dotenv').config();

console.log('🔍 Checking AWS Credentials...\n');

// Check environment variables
console.log('Environment Variables:');
console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✓ Set' : '✗ Missing'}`);
console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✓ Set' : '✗ Missing'}`);
console.log(`AWS_REGION: ${process.env.AWS_REGION || 'us-east-1'}`);
console.log(`AWS_S3_BUCKET: ${process.env.AWS_S3_BUCKET || 'Not set'}\n`);

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();

// Test connection
console.log('🔄 Testing AWS S3 Connection...');
s3.listBuckets({}, (err, data) => {
  if (err) {
    console.error('❌ AWS Connection Error:', err.code, err.message);
    console.error('\n💡 Common Solutions:');
    console.error('1. Check if AWS credentials are valid');
    console.error('2. Check if IAM user has S3 permissions');
    console.error('3. Check network connectivity to AWS');
    console.error('4. Verify AWS region is correct\n');
    console.error('🔧 For local development, you can use:');
    console.error('   - AWS CLI: aws configure');
    console.error('   - Check credentials: aws sts get-caller-identity');
  } else {
    console.log('✅ AWS Connection Successful!');
    console.log('Available Buckets:');
    data.Buckets.forEach(bucket => {
      console.log(`   - ${bucket.Name} (Created: ${bucket.CreationDate})`);
    });
    
    // Check if our bucket exists
    const targetBucket = process.env.AWS_S3_BUCKET;
    if (targetBucket) {
      const bucketExists = data.Buckets.some(b => b.Name === targetBucket);
      if (bucketExists) {
        console.log(`\n✅ Bucket "${targetBucket}" exists!`);
      } else {
        console.log(`\n⚠️  Bucket "${targetBucket}" does not exist. You need to create it first.`);
        console.log('   Create it using:');
        console.log(`   aws s3api create-bucket --bucket ${targetBucket} --region ${process.env.AWS_REGION || 'us-east-1'}`);
      }
    }
  }
});