const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  region:          process.env.AWS_REGION || 'ap-south-1',
  accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const BUCKET = process.env.S3_BUCKET_NAME || 'vidyasetu-content';

/**
 * Generate a presigned URL for uploading a file.
 */
async function getUploadUrl(key, contentType, expiresIn = 300) {
  return s3.getSignedUrlPromise('putObject', {
    Bucket:      BUCKET,
    Key:         key,
    ContentType: contentType,
    Expires:     expiresIn,
  });
}

/**
 * Generate a presigned URL for downloading/viewing a private file.
 */
async function getDownloadUrl(key, expiresIn = 3600) {
  return s3.getSignedUrlPromise('getObject', {
    Bucket:  BUCKET,
    Key:     key,
    Expires: expiresIn,
  });
}

/**
 * Delete an object from S3.
 */
async function deleteObject(key) {
  return s3.deleteObject({ Bucket: BUCKET, Key: key }).promise();
}

/**
 * Build the public CDN URL for a given key.
 * Use for public assets (thumbnails, icons) — not private content.
 */
function publicUrl(key) {
  return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

module.exports = { s3, BUCKET, getUploadUrl, getDownloadUrl, deleteObject, publicUrl };
