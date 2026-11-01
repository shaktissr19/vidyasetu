#!/usr/bin/env node
'use strict';

const path = require('path');
const backendPath = path.resolve(__dirname, '../backend');
const dotenv = require(require.resolve('dotenv', { paths: [backendPath] }));
const AWS = require(require.resolve('aws-sdk', { paths: [backendPath] }));
const { mergeHomepageVideoCorsRule } = require('./lib/homepageVideoCors');

dotenv.config({ path: path.join(backendPath, '.env') });

async function main() {
  const bucket = process.env.S3_BUCKET_NAME || 'vidyasetu-content';
  const region = process.env.AWS_REGION || 'ap-south-1';
  let origin;
  try { origin = new URL(process.env.FRONTEND_URL || '').origin; }
  catch { throw new Error('Set FRONTEND_URL in backend/.env to the HTTPS website origin, for example https://vidyasetu.sbs.'); }
  if (!origin.startsWith('https://')) throw new Error('FRONTEND_URL must use HTTPS.');

  const s3 = new AWS.S3({ region });
  let existingRules = [];
  try {
    const current = await s3.getBucketCors({ Bucket: bucket }).promise();
    existingRules = current.CORSRules || [];
  } catch (error) {
    if (error.code !== 'NoSuchCORSConfiguration') {
      throw new Error(`Could not read the current CORS rules for bucket ${bucket}: ${error.message}. Ensure this AWS identity can call s3:GetBucketCORS.`);
    }
  }

  const CORSRules = mergeHomepageVideoCorsRule(existingRules, origin);
  await s3.putBucketCors({ Bucket: bucket, CORSConfiguration: { CORSRules } }).promise();
  const verified = await s3.getBucketCors({ Bucket: bucket }).promise();
  const rule = (verified.CORSRules || []).find((item) => item.ID === 'vidyasetu-homepage-video-browser-upload');
  if (!rule || !rule.AllowedOrigins?.includes(origin) || !rule.AllowedMethods?.includes('PUT')) {
    throw new Error('S3 did not return the expected VidyaSetu video upload CORS rule after saving it.');
  }
  console.log(`Configured homepage video upload CORS for ${origin} on bucket ${bucket}. Existing CORS rules were preserved.`);
}

main().catch((error) => {
  console.error(`Homepage video storage CORS was not changed: ${error.message}`);
  process.exitCode = 1;
});
