# Home introduction video storage

The Home page editor uploads video files directly to S3 using a short-lived presigned URL. The browser needs an S3 CORS rule for the exact HTTPS origin in `FRONTEND_URL`, the `PUT` method, and the `Content-Type` request header. The upload ticket alone does not prove that AWS accepts the configured credentials: presigned URLs are locally signed, so an invalid AWS key can still produce a URL.

## Configure credentials on the VPS

Use one of these credential sources:

- Set both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `backend/.env` to a current, matching key pair; or
- Leave both values empty and attach an IAM role to the VPS. The backend uses the AWS SDK default credential chain when the static pair is absent.

Never set only one key. The backend now rejects a partial key pair before issuing a video upload URL. Do not paste AWS credentials into support messages or commit them to Git.

The identity needs `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::vidyasetu-content/homepage-intro/*`. To configure the bucket rule with the provided script, it also needs `s3:GetBucketCORS` and `s3:PutBucketCORS` on `arn:aws:s3:::vidyasetu-content`. `sts:GetCallerIdentity` does not require an IAM allow policy.

## Verify and apply

From `/var/www/vidyasetu`, verify the exact credentials and role used by the backend environment. This prints only the AWS account and principal, never the secret key:

```bash
node - <<'NODE'
require('dotenv').config({ path: 'backend/.env' });
const AWS = require('./backend/node_modules/aws-sdk');
new AWS.STS({ region: process.env.AWS_REGION || 'ap-south-1' }).getCallerIdentity({})
  .promise()
  .then(({ Account, Arn }) => console.log({ Account, Arn }))
  .catch((error) => {
    console.error(`AWS identity check failed: ${error.code || 'AWS error'}: ${error.message}`);
    process.exitCode = 1;
  });
NODE
```

After the identity check succeeds, apply and verify the bucket rule:

```bash
node scripts/configure-homepage-video-cors.js
```

If the identity check reports `InvalidAccessKeyId` or `InvalidClientTokenId`, replace the key pair or clear both keys and use the VPS IAM role. If the CORS script then reports `AccessDenied`, grant the bucket CORS actions above and rerun it. Restart the backend after changing its credentials, then try the upload again. No frontend deployment is needed for a bucket CORS update.
