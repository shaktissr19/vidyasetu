# VidyaSetu Student PWA Shell Contract

Status: implementation contract for the installable Student web-app shell.

## Goal

Make the existing VidyaSetu Student workspace installable and resilient to a disconnected reload without creating a second application or weakening authentication boundaries.

## Scope

This module adds progressive-web-app capabilities to the existing Next.js Student experience:

- standards-based web app manifest
- 192px and 512px install icons
- Student-first installed start URL
- service-worker registration and update lifecycle
- versioned Student/app-shell caching
- navigation fallback to an already cached Student shell
- install prompt/status surfaced from Offline Mode
- online/offline runtime status

The PWA is the same VidyaSetu web application. It does not introduce a separate account, database, deployment path or native-app backend.

## Security boundary

The service worker is deliberately unauthenticated infrastructure.

It must never:

- receive or persist `vs_access_token` or `vs_refresh_token`
- read or write browser `localStorage`
- synthesize `Authorization` headers
- cache authenticated `/api/` responses
- replay homework, assessment, competition, payment or authentication mutations

Authenticated offline-progress replay belongs to the foreground Student application and is governed by `docs/offline-learning-sync-contract.md`.

## Install contract

Manifest requirements:

- app id: `/student`
- start URL: `/student`
- display mode: `standalone`
- scope: `/`
- valid PNG icons at 192x192 and 512x512
- VidyaSetu theme/background colours

When the browser supports `beforeinstallprompt`, Offline Mode may expose an explicit Install action. Browsers that do not expose that event receive browser-menu guidance instead.

## Offline shell contract

The service worker may cache:

- same-origin Student/navigation shell responses
- static Next.js assets
- VidyaSetu images/manifest/icons
- learning assets explicitly requested by the foreground Student application

It must not cache API responses. A disconnected Student dashboard may use the active Student account's IndexedDB snapshot as a read-only fallback; account isolation is mandatory.

## Update lifecycle

A newly installed service worker may activate and take control without requiring an application reload loop. Obsolete VidyaSetu cache versions are removed on activation while the current app-shell and learning-asset caches are preserved.

## Out of scope

This module does not add:

- push notifications
- background authentication
- background assessment/homework submission
- native Android/iOS packaging
- offline account creation/login
- offline payments

## Acceptance gates

- strict frontend TypeScript passes
- production Next.js build passes
- manifest parses and references real non-empty 192px/512px PNG files
- service worker parses with Node syntax validation
- static security check proves `/api/` exclusion and absence of token/localStorage/Authorization handling in the service worker
- legacy Student regression remains green
- Offline Learning & Resilient Sync gate is green on the same final head
