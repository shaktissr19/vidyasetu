# VidyaSetu governed source registry and video learning discovery

## Purpose

The Admin Learning Content Factory now exposes one governed source selector for text, video, audio, interactive, PDF and course discovery. The implementation deliberately distinguishes **live structured connectors** from **official reference-search connectors** so VidyaSetu does not pretend that an undocumented or unstable third-party API is reliable.

## Admin path

`Admin → Learning → Source Discovery & Video Learning`

The workspace supports multi-select search across:

- VidyaSetu governed catalogue (`LOCAL`)
- DIKSHA / PM eVIDYA (`DIKSHA`)
- NROER
- CBSE Academic
- NCERT / ePathshala
- NIOS Digital Learning
- SWAYAM
- PhET
- OER Commons

## Connector modes

### LOCAL_CATALOGUE

Searches approved/published canonical VidyaSetu Learning resources directly. Stored licence and review state remain authoritative.

### LIVE_API

Currently DIKSHA. VidyaSetu calls the public structured search endpoint and normalizes metadata such as class, subject, language, publisher/channel, licence candidate, media kind, duration and thumbnail where available.

Remote metadata is still only discovery evidence. It does not approve reuse rights.

### REFERENCE_SEARCH

Used for official/open sources where VidyaSetu does not rely on a stable documented structured API. Search returns an official source navigation card rather than fabricating item metadata. Admin opens the official source, selects the exact resource/video, and stages that exact official URL into OER Intake.

This mode currently covers NROER, CBSE Academic, NCERT/ePathshala, NIOS, SWAYAM, PhET and OER Commons.

## Learning media filters

Normalized media kinds:

- `ARTICLE` → Learn
- `VIDEO` → Watch
- `AUDIO` → Listen
- `INTERACTIVE` → Explore
- `PDF` → PDF / worksheet
- `COURSE` → course
- `LINK` → external reference

The Admin UI also supports:

- Class 1–12
- Subject
- Language / medium
- Publisher/channel (with NCERT, CBSE, NIOS, PM eVIDYA presets)
- Video maximum duration for short/micro-video discovery
- Commercial/subscriber-safe-only filtering
- Multiple sources in a single search

## Video learning policy

A video candidate is never trusted solely because it is free to watch. Source rights determine how it may be used.

- VidyaSetu approved videos can be used according to their stored licence/access policy.
- DIKSHA video metadata requires item-level licence/attribution verification.
- CBSE, NCERT/ePathshala, NIOS and SWAYAM default to link/reference handling unless an item explicitly grants broader rights.
- PhET is treated as non-commercial by default and must not ground Subscriber/commercial output without separate permission/licensing.
- OER Commons items require item-level conditions-of-use review.
- NROER remains item-level-review governed and rehosting stays off by default.

## Selected external item flow

For reference-search connectors:

1. Admin searches/selects a source in VidyaSetu.
2. VidyaSetu opens the official source search/navigation page.
3. Admin selects a specific resource/video on the official domain.
4. Admin pastes the exact item URL/title into the Source Discovery selected-item form.
5. Backend validates that the URL belongs to the selected official source domain.
6. Item is staged to canonical `learning_source_intake`.
7. Licence/attribution review remains mandatory.
8. Only an approved/imported item can become Creator input.
9. Creator still materialises canonical DRAFT entities only.
10. Private/Public Learning submission and the normal Learning Studio review/publish workflow remain unchanged.

## Database

Migration `047_learning_source_registry_video_discovery.sql`:

- extends discovery providers
- adds `CC_BY_NC`
- registers CBSE, NCERT/ePathshala, NIOS, SWAYAM, PhET and OER Commons source records
- creates `learning_source_connectors`
- records connector mode/capabilities/licence/commercial policy
- adds normalized candidate media metadata (`media_kind`, duration, thumbnail, embed URL, reference-only marker)

The migration is additive/idempotent and publishes nothing.

## Security and governance

- Creator/discovery endpoints remain `SUPER_ADMIN` only.
- Selected external URLs are HTTPS-only and constrained to the selected official source domain.
- VidyaSetu does not silently scrape arbitrary URLs.
- Reference-search entries cannot themselves be staged as reusable content.
- Item-level licence and attribution governance remains enforced before approval/import.
- AI generation cannot auto-publish.
