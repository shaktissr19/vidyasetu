# Release gate: migration 049

Do not apply migration 049 or deploy this branch to production before the pull request is fully green and merged to `main`.

After merge, production migration must be applied explicitly with backup/validation, followed by the existing native `scripts/deploy-main-native.sh` release path. Never use Docker or `database/run_all_migrations.sql` in production.
