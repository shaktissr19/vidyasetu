# Demo school network seed

This adds synthetic staging data only; it does not write real student records or UDISE identifiers.

## What it creates

After the existing development fixture is present, the seed brings the selected demo dataset to:

- 9 demo schools
- 15 demo students, with school/class and parent links
- 12 demo teachers
- 12 demo parents
- Student attendance, scored exam results, and term fee invoices/payments

The SQL seed is repeatable. It requires an explicit PostgreSQL session flag and a database name containing `dev`, `test`, or `stage`.

## Run in a staging/dev environment

From the repository root, after migrations and the normal development fixture have been applied:

```bash
npm --prefix backend run build
node scripts/seed-demo-network.cjs
```

The runner reads `backend/.env` (or existing process environment variables), checks the actual connected database name, and refuses `NODE_ENV=production` or database names outside dev/test/stage. It executes the guarded SQL and assigns each newly added user a unique random temporary password using VidyaSetu's existing scrypt password format. It sets `must_change_password` so the account must replace that temporary password after login.

The runner prints the one-time passwords to its terminal only after successful commit. Copy and distribute them through a secure channel; do not paste them into GitHub or a public chat. Re-running the runner generates new temporary passwords for these added demo accounts.
