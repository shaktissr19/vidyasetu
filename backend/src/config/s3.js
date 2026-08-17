const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET = process.env.S3_BUCKET_NAME || 'vidyasetu-content';

async function getUploadUrl(key, contentType, expiresIn = 300) {
  return s3.getSignedUrlPromise('putObject', {
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    Expires: expiresIn,
  });
}

async function getDownloadUrl(key, expiresIn = 3600) {
  // Development/demo content can use an application-relative or public URL.
  // Production S3 objects continue to use signed URLs.
  if (typeof key === 'string' && (key.startsWith('/') || key.startsWith('http://') || key.startsWith('https://'))) {
    return key;
  }
  return s3.getSignedUrlPromise('getObject', {
    Bucket: BUCKET,
    Key: key,
    Expires: expiresIn,
  });
}

async function deleteObject(key) {
  if (typeof key === 'string' && (key.startsWith('/') || key.startsWith('http://') || key.startsWith('https://'))) {
    return { skipped: true };
  }
  return s3.deleteObject({ Bucket: BUCKET, Key: key }).promise();
}

function publicUrl(key) {
  if (typeof key === 'string' && (key.startsWith('/') || key.startsWith('http://') || key.startsWith('https://'))) return key;
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
}

module.exports = { s3, BUCKET, getUploadUrl, getDownloadUrl, deleteObject, publicUrl };
