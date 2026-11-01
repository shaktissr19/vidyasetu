const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const testRoot = path.join(os.tmpdir(), `vidyasetu-homepage-video-${process.pid}`);
process.env.HOMEPAGE_VIDEO_STORAGE = 'local';
process.env.HOMEPAGE_VIDEO_LOCAL_DIR = path.join(testRoot, 'published');
const homepage = require('../dist/services/homepage.service');

test('stores and serves an MP4 from persistent local media without AWS credentials', async (t) => {
  t.after(async () => fs.rm(testRoot, { recursive: true, force: true }));
  const incomingPath = path.join(testRoot, 'incoming.mp4');
  const videoBytes = Buffer.from('test-video-bytes');
  await fs.mkdir(testRoot, { recursive: true });
  await fs.writeFile(incomingPath, videoBytes);

  const stored = await homepage.storeHomepageVideo(incomingPath, 'intro.mp4', 'video/mp4', videoBytes.length);
  assert.match(stored.videoUrl, /^\/api\/v1\/public\/homepage\/videos\/[0-9a-f-]{36}\.mp4$/i);
  const filename = path.basename(stored.videoUrl);
  const delivery = await homepage.getHomepageVideoDelivery(filename);

  assert.equal(delivery.type, 'file');
  assert.equal(await fs.readFile(delivery.filePath, 'utf8'), videoBytes.toString());
  await assert.rejects(fs.access(incomingPath));
});
