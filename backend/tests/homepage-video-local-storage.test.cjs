const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const testRoot = path.join(os.tmpdir(), `vidyasetu-homepage-video-${process.pid}`);
process.env.HOMEPAGE_VIDEO_STORAGE = 'local';
process.env.HOMEPAGE_VIDEO_LOCAL_DIR = path.join(testRoot, 'published');
const homepage = require('../dist/services/homepage.service');

test('stores and serves a valid MP4 with blank browser MIME metadata and no AWS credentials', async (t) => {
  t.after(async () => fs.rm(testRoot, { recursive: true, force: true }));
  const incomingPath = path.join(testRoot, 'incoming.mp4');
  const videoBytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom')]);
  await fs.mkdir(testRoot, { recursive: true });
  await fs.writeFile(incomingPath, videoBytes);

  const stored = await homepage.storeHomepageVideo(incomingPath, 'intro.mp4', '', videoBytes.length);
  assert.match(stored.videoUrl, /^\/api\/v1\/public\/homepage\/videos\/[0-9a-f-]{36}\.mp4$/i);
  const filename = path.basename(stored.videoUrl);
  const delivery = await homepage.getHomepageVideoDelivery(filename);

  assert.equal(delivery.type, 'file');
  assert.deepEqual(await fs.readFile(delivery.filePath), videoBytes);
  await assert.rejects(fs.access(incomingPath));
});


test('rejects files whose contents do not match their video extension', async (t) => {
  t.after(async () => fs.rm(testRoot, { recursive: true, force: true }));
  const incomingPath = path.join(testRoot, 'not-a-video.mp4');
  await fs.mkdir(testRoot, { recursive: true });
  await fs.writeFile(incomingPath, 'not an MP4 container');

  await assert.rejects(
    homepage.storeHomepageVideo(incomingPath, 'not-a-video.mp4', 'application/octet-stream', 20),
    /contents do not match/i,
  );
});
