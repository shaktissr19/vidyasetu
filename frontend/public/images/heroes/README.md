# Public hero photography

The active public hero sources are mapped in `frontend/src/components/public/heroAssets.ts`.

## Quality rules

- Use a dedicated landscape photograph for each public module.
- Request at least UHD-class width (`w=3840`) from the source.
- CI downloads every active source and rejects images below 2400×1200, suspiciously small files, or portrait/ultra-wide ratios.
- Desktop composition is intentionally split: approximately 42% copy / 58% photography. Do not stretch photographs underneath all hero text.
- Keep the copy/photo transition narrow around the centre; do not restore the old 70% white wash.
- Do not reintroduce the old 960×540 AVIFs or `vidyasetu-hero-sprite.jpg`.

## Source

Current photographs are sourced from Pexels under the Pexels license. Source IDs and photographer context are documented alongside each mapping in `heroAssets.ts`.
