# VidyaSetu Offline Learning & Resilient Sync Contract

Status: implementation contract for the Student offline-learning module.

## Goal

Keep approved learning assets usable through weak or interrupted connectivity and preserve safe learner progress until the authenticated Student app can reconnect.

## Safety boundary

The service worker never receives or stores VidyaSetu access/refresh tokens. It handles only same-origin app-shell requests and explicitly requested learning asset URLs.

Authenticated mutations are replayed only by the foreground Student application, which already owns the authenticated Axios session.

## Offline-capable actions

Initial resilient-sync scope is deliberately limited to idempotent learner progress:

- legacy content completion: `POST /content/items/:contentItemId/complete`
- Learning Hub progress: `PATCH /student/learning/resources/:resourceId/progress`

Assessment/competition submissions, homework submissions, authentication, payments and other high-consequence writes are not queued offline.

## Local stores

IndexedDB database: `vidyasetu-offline-v1`

- `downloads`: device-local cache metadata, partitioned by Student user ID
- `syncQueue`: authenticated progress writes waiting for foreground replay
- `meta`: last successful sync and runtime metadata

Queue entries use a deterministic `dedupeKey`. Repeated progress operations replace the older queued action instead of creating duplicate writes.

## Service worker

Path: `/sw.js`

Responsibilities:

- versioned app-shell cache
- navigation fallback to cached Student shell when possible
- explicit learning-asset cache/remove messages from the Student application
- cache lookup reporting for Offline Mode
- deletion of obsolete VidyaSetu cache versions on activation

The service worker must not cache authenticated `/api/` responses.

## Foreground sync lifecycle

1. Student action succeeds online -> normal server state.
2. Student is offline or receives a network-only failure -> queue the safe action in IndexedDB and immediately communicate that it is saved for sync.
3. `online` event or Student workspace startup -> foreground sync manager flushes queued actions sequentially.
4. 2xx -> remove queue entry and record last sync.
5. 401/403 -> stop replay so normal authentication recovery can run.
6. Other 4xx -> mark as permanent failure and keep it visible for manual removal/retry.
7. Network/5xx -> retain with bounded exponential retry metadata.

## Account isolation

Every device-local download and queued write is keyed by Student user ID. Student UI reads and flushes only the active account's records. Logout does not expose another Student's offline metadata.

## Acceptance gates

- strict frontend TypeScript
- production Next build
- legacy Student E2E remains green
- deterministic queue/dedupe/retry tests
- service-worker static safety checks proving `/api/` is excluded from caching and no token-storage code is present
