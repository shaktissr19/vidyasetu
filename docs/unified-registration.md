# Unified account creation and approval

Public `/register` offers Student, Parent/Guardian, Teacher/Educator and School/Institution forms. Each login surface links to its matching registration form using `?role=student|parent|teacher|school`.

| Account | Fields and workflow | Activation |
|---|---|---|
| Student | Identity, password, language, grade, optional School/class and Parent invitation | Independent learning immediately; School enrollment and Parent access require confirmation |
| Parent | Identity, password, language, optional permanent Student ID and relationship | Account immediately; child access only after Student confirmation |
| Teacher | Identity, password, selected active School, employment/qualification details | School approves in `/school/teachers`; class/subject assignments remain School-managed |
| School | Representative identity/password, institution identity, board/location/contact details | Platform Admin verifies and activates in Admin School Management |
| Platform Admin | Existing Admin creates name, username, mobile, optional email and password in `/admin/users` | Admin-only API; never public self-registration |

## Approval boundaries

- Student identity, School enrollment request and Parent invitation commit together. A failed invitation cannot leave a successfully registered account behind.
- Parent relationships require an explicit confirmation by the opposite side. A registration form or login never grants a new Parent relationship automatically.
- Parent-initiated pending requests do not reveal the Student name, grade or School.
- Teacher registration creates a pending user and membership request. Approval creates the canonical Teacher record. Other Schools cannot review the request.
- School registration creates a pending institution and representative. Activation updates both; suspension blocks existing representative and Teacher access tokens.
- Pending users receive no password/OTP session. API authorization also checks current account role/status and current School membership.
- Only active Platform Admins can create additional Platform Admins; creation is audited and password hashes are never returned.
- Existing verified relationships and School-created staff remain available.

## Production release

Use the existing native Ubuntu/PostgreSQL/Redis/Nginx/PM2 release path. No Docker, reset or demo seed is required.

After this branch is merged, run on the server:

```bash
set -euo pipefail
cd /var/www/vidyasetu
test -z "$(git status --porcelain --untracked-files=no)"
git switch main
git pull --ff-only origin main
bash scripts/prepare-registration-release.sh
bash scripts/deploy-main-native.sh
```

Preparation reads the existing backend environment without sourcing it, requires the older Learning/School baseline, creates a private pre-migration custom PostgreSQL dump and validates its archive listing, applies missing 044–049 schemas in order, and explicitly applies idempotent migration 050. It does not run historical migrations or seed scripts. Archive validation does not replace a restore rehearsal.

Migration 049 can backfill historical licence verification from previous review metadata. Migration 050 moves legacy unconfirmed Student invitations to AWAITING_PARENT and retains the oldest of duplicate open parent/student pairs, rejecting additional open duplicates while preserving their rows. Review this data behavior before a production change window.

The deploy script checks the registration/Learning schema before switching PM2 and attempts the previous release on any command failure after the switch, including local/public smoke. A missing previous release is reported; rollback does not reverse migrations. If preparation fails, stop and inspect its output; do not reset the database. If the baseline tables are missing, the earlier production migration path requires separate review.

## First Platform Admin

Most existing deployments already have a Platform Admin. Log in and use Admin User Management to create any additional administrator.

For a fresh installation with **no SUPER_ADMIN row at all**, a server operator can bootstrap the first account through `backend/dist/scripts/bootstrapPlatformAdmin.js`. The script reads JSON from stdin, refuses existing identities and refuses to bootstrap when any Platform Admin already exists. It never promotes another role or resets an existing password.

From the active release's backend directory after a successful production build:

```bash
set -euo pipefail
read -r -p 'Admin full name: ' VS_ADMIN_NAME
read -r -p 'Admin username: ' VS_ADMIN_USERNAME
read -r -p 'Admin mobile: ' VS_ADMIN_MOBILE
read -r -p 'Admin email (optional): ' VS_ADMIN_EMAIL
read -r -s -p 'Admin password: ' VS_ADMIN_PASSWORD
printf '\n'
export VS_ADMIN_NAME VS_ADMIN_USERNAME VS_ADMIN_MOBILE VS_ADMIN_EMAIL VS_ADMIN_PASSWORD
node -e 'process.stdout.write(JSON.stringify({name:process.env.VS_ADMIN_NAME,username:process.env.VS_ADMIN_USERNAME,mobile:process.env.VS_ADMIN_MOBILE,email:process.env.VS_ADMIN_EMAIL||undefined,password:process.env.VS_ADMIN_PASSWORD}))' | node dist/scripts/bootstrapPlatformAdmin.js
unset VS_ADMIN_NAME VS_ADMIN_USERNAME VS_ADMIN_MOBILE VS_ADMIN_EMAIL VS_ADMIN_PASSWORD
```

Do not run demo seeds to create production administrators. Share account credentials securely and have the recipient change the password from their account security page.

## Validation

`scripts/unified-registration-e2e-smoke.sh` is a disposable-database test, never a production smoke. It covers all five roles, duplicate identities, no public admin creation, pending login denial, Student/Parent confirmation and rejection, School/Teacher approval, wrong-School denial, suspension, admin creation authorization and secret-free responses. School Native CI runs it alongside the existing School regression and migration-050 idempotence checks. Student Native and Student behavioral/session CI explicitly install 050 and require Parent confirmation before child access.
