# Public visual implementation progress

In progress on `visual-release-dedicated-heroes-subject-system`.

Completed in source:
- acceptance criteria locked
- central hero asset registry added
- deterministic subject + grade-band visual helper and styling added

Remaining before release-ready:
- attach the approved dedicated image binaries to the repo
- wire ImageHero, Home module cards, module pages, Learn, Competition and Login to those assets
- wire subject visuals into Home/Learn/catalogue resource cards
- readability/card spacing pass
- remove old shared sprite usage from public UX
- exact-head build/CI + visual smoke validation

Production deployment is intentionally blocked until these items pass.
