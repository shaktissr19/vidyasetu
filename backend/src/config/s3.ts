import AWS from 'aws-sdk';

export const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

export const BUCKET = process.env.S3_BUCKET_NAME || 'vidyasetu-content';

export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  return s3.getSignedUrlPromise('putObject', {
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    Expires: expiresIn,
  });
}

export async function getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  if (key.startsWith('/') || key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }
  return s3.getSignedUrlPromise('getObject', {
    Bucket: BUCKET,
    Key: key,
    Expires: expiresIn,
  });
}

export async function deleteObject(
  key: string,
): Promise<AWS.S3.DeleteObjectOutput | { skipped: true }> {
  if (key.startsWith('/') || key.startsWith('http://') || key.startsWith('https://')) {
    return { skipped: true };
  }
  return s3.deleteObject({ Bucket: BUCKET, Key: key }).promise();
}

export function publicUrl(key: string): string {
  if (key.startsWith('/') || key.startsWith('http://') || key.startsWith('https://')) return key;
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
}
