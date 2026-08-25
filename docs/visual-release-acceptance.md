# VidyaSetu public visual release acceptance

This release is not deployable until all of the following pass:

- Dedicated page photography for Home, Students, Schools & Teachers, Parents, Learning, Competitions, Communities and Platform Admin; no shared hero-sprite crop architecture.
- Student Login uses dedicated student photography while preserving password-first login, username/email/mobile/Student ID, OTP, recovery, role validation and redirects.
- Home keeps six functional module cards in a 3×2 desktop grid; each card has a meaningful, full media visual rather than unused space with a tiny emoji.
- Home public Learning preview remains API-backed and bounded to three resources.
- Learning keeps stage/grade/board/category filters, initial six resources, Load 6 more, View all learning, practice, question papers and Skills for Life.
- Learning resource visuals use deterministic subject + grade-band identity, with real thumbnails taking precedence when supplied by the API.
- Small supporting text remains readable; cards stay compact, spacious, aligned, bordered and visually separated from the page background.
- Hero copy stays short, page-specific and unobscured; photography must remain clearly visible at desktop and mobile breakpoints.
- Competition registration, attempts, results and leaderboard behavior is unchanged.
- No backend, schema, DB, seed or production migration changes.
- Native production deployment only; no Docker.
- Exact-head CI/build and visual smoke checks must pass before merge/deploy.
