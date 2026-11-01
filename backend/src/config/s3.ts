import AWS from 'aws-sdk';
import { getAwsCredentialMode, getStaticAwsCredentials } from './awsCredentials';

const region = process.env.AWS_REGION || 'ap-south-1';
const staticCredentials = getStaticAwsCredentials(process.env);

// With no static key pair, let the AWS SDK use the standard credential chain
// (for example, the EC2 instance profile). Never pass blank credential fields.
export const s3 = new AWS.S3({ region, ...(staticCredentials || {}) });

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

export async function verifyS3Credentials(): Promise<void> {
  const mode = getAwsCredentialMode(process.env);
  if (mode === 'partial-static') {
    throw Object.assign(
      new Error('Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or clear both to use the VPS instance role.'),
      { statusCode: 503, apiCode: 'MEDIA_STORAGE_CREDENTIALS_INVALID' },
    );
  }

  try {
    // GetCallerIdentity requires no IAM allow policy. This prevents returning
    // a locally signed URL when AWS would reject the configured credentials.
    await new AWS.STS({ region, ...(staticCredentials || {}) }).getCallerIdentity({}).promise();
  } catch (error: unknown) {
    const awsError = error as { code?: string; message?: string };
    const invalidCredentialCodes = new Set([
      'AuthFailure',
      'ExpiredToken',
      'InvalidAccessKeyId',
      'InvalidClientTokenId',
      'SignatureDoesNotMatch',
      'UnrecognizedClientException',
    ]);
    const detail = invalidCredentialCodes.has(awsError.code || '')
      ? 'AWS rejected the configured storage credentials. Replace the key pair or clear both keys to use the VPS instance role.'
      : 'AWS could not verify the storage identity. Check VPS access to the AWS STS endpoint and try again.';
    throw Object.assign(new Error(detail), {
      statusCode: 503,
      apiCode: 'MEDIA_STORAGE_CREDENTIALS_INVALID',
    });
  }
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
