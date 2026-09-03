/* VidyaSetu PWA service worker.
 * Authenticated API responses are intentionally never cached here.
 */

const APP_CACHE = 'vidyasetu-app-v2';
const LEARNING_CACHE = 'vidyasetu-learning-v2';
const SHELL_URLS = ['/', '/student', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.all(SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response.clone());
      } catch (_) {
        // A partial shell is still useful; runtime visits will fill missing entries.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if (name.startsWith('vidyasetu-') && name !== APP_CACHE && name !== LEARNING_CACHE) {
        return caches.delete(name);
      }
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

function isApiRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/images/')
    || url.pathname === '/manifest.json'
    || url.pathname === '/icon-192.png'
    || url.pathname === '/icon-512.png'
  );
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request))
      || (await cache.match('/student'))
      || (await cache.match('/'))
      || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStatic(request));
  }
});

async function cacheLearningAsset(rawUrl) {
  const url = new URL(rawUrl, self.location.origin);
  if (isApiRequest(url)) throw new Error('API responses cannot be stored for offline use');
  const sameOrigin = url.origin === self.location.origin;
  const response = await fetch(url.toString(), {
    credentials: sameOrigin ? 'include' : 'omit',
    mode: sameOrigin ? 'same-origin' : 'cors',
  });
  if (!response.ok) throw new Error(`Learning asset request failed (${response.status})`);
  const cache = await caches.open(LEARNING_CACHE);
  await cache.put(url.toString(), response.clone());
}

async function removeLearningAsset(rawUrl) {
  const url = new URL(rawUrl, self.location.origin);
  const cache = await caches.open(LEARNING_CACHE);
  return cache.delete(url.toString());
}

async function checkLearningAsset(rawUrl) {
  const url = new URL(rawUrl, self.location.origin);
  const cache = await caches.open(LEARNING_CACHE);
  return Boolean(await cache.match(url.toString()));
}

self.addEventListener('message', (event) => {
  const message = event.data || {};
  const reply = (payload) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
  };

  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting();
    reply({ ok: true });
    return;
  }

  if (!message.url) return;

  if (message.type === 'CACHE_LEARNING_ASSET') {
    event.waitUntil(cacheLearningAsset(message.url)
      .then(() => reply({ ok: true, cached: true }))
      .catch((error) => reply({ ok: false, error: error instanceof Error ? error.message : 'Cache failed' })));
    return;
  }

  if (message.type === 'REMOVE_LEARNING_ASSET') {
    event.waitUntil(removeLearningAsset(message.url)
      .then(() => reply({ ok: true, cached: false }))
      .catch((error) => reply({ ok: false, error: error instanceof Error ? error.message : 'Remove failed' })));
    return;
  }

  if (message.type === 'CHECK_LEARNING_ASSET') {
    event.waitUntil(checkLearningAsset(message.url)
      .then((cached) => reply({ ok: true, cached }))
      .catch((error) => reply({ ok: false, error: error instanceof Error ? error.message : 'Cache check failed' })));
  }
});
