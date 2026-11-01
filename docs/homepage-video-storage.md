# Home introduction video storage

The Home editor sends the video through an authenticated VidyaSetu API endpoint. The browser no longer sends the file directly to S3, so new uploads do not depend on S3 CORS. Uploads accept MP4, WebM, and Ogg files up to 250 MB. The backend streams them from temporary disk storage to the selected provider.

## VPS-local storage (default)

Set these values in `backend/.env`:

```env
HOMEPAGE_VIDEO_STORAGE=local
HOMEPAGE_VIDEO_LOCAL_DIR=/var/lib/vidyasetu/media/homepage-intro
```

The API creates the directory when it receives the first upload. The application process must be able to write there. Keep this directory outside the code release directories so deployments do not remove uploaded files, and include it in the VPS backup plan. The deployment config already allows requests up to 260 MB; the video endpoint caps each file at 250 MB.

Local storage avoids AWS credentials, bucket permissions, and S3 CORS for this video. It is a good fit for the current single-VPS introduction video, provided the directory is persistent and backed up.

## S3 storage (optional)

Set `HOMEPAGE_VIDEO_STORAGE=s3` to use the existing S3 bucket. Set both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to a current matching pair, or leave both empty to use the VPS IAM role. The S3 identity needs `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::vidyasetu-content/homepage-intro/*`. `sts:GetCallerIdentity` is used to check the credential identity before issuing an upload operation and does not require an IAM allow policy.

This upload path is proxied through the backend, so new video uploads no longer need bucket CORS rules. The legacy presigned upload URL endpoint remains only for clients from older releases; `node scripts/configure-homepage-video-cors.js` is not needed by the current editor.

## Playback and publishing

The public video route supports browser byte-range playback for files stored locally. When local mode is selected, it also falls back to the existing S3 object for videos created by the earlier upload flow. Publishing requires a poster, English or Hindi WebVTT captions, and a transcript. The player does not autoplay.
