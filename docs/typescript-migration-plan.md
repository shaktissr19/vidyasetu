# VidyaSetu Full TypeScript Migration Plan

## Baseline and invariants

- Repository: `shaktissr19/vidyasetu`
- Migration branch: `typescript-migration`
- Exact baseline SHA: `50c203ca53bca9023d5ab675f78ef9e93f2bbf78`
- Production runtime remains native Ubuntu + Nginx + PostgreSQL + Redis + PM2.
- Backend remains Express + `pg` + Redis + Zod.
- Frontend remains Next.js 14.2.3 + React 18 + Zustand.
- This migration must not change routes, UI, colors, layouts, user flows, database data, identifiers, credentials, school relationships, enrollment behavior, parent links, attendance, fees, timetable, exams/results, announcements, or authentication behavior.
- No production database recreation. No destructive volume deletion. No framework or major-version upgrade as part of this work.

## Verified JavaScript/JSX inventory

### Backend application source — 57 `.js` files

| Area | Count |
| --- | ---: |
| `src/config` | 4 |
| `src/controllers` | 9 |
| `src/index.js` | 1 |
| `src/jobs` | 3 |
| `src/middleware` | 5 |
| `src/models` | 1 |
| `src/routes` | 9 |
| `src/services` | 19 |
| `src/utils` | 6 |
| **Total** | **57** |

### Frontend application source — 90 `.js/.jsx` files

- 74 `.jsx` files.
- 16 `.js` files under `src`.
- 57 App Router JSX files.
- 17 component JSX files.
- 16 non-JSX application JS files across UI helpers, hooks, services, stores, and utilities.

### Frontend tooling/config JavaScript — 3 files

- `next.config.js`
- `postcss.config.js`
- `tailwind.config.js`

### Migration surface

- **147 application JS/JSX source files**.
- **150 JS/JSX files including frontend tooling/config**.

Shell deployment/smoke scripts are not JavaScript application source and remain shell scripts.

## High-risk modules identified before migration

### Backend

1. `src/config/db.js`
   - Central `pg` Pool and raw query/transaction helpers.
   - Must become generic, typed query helpers without changing SQL behavior.
2. `src/config/redis.js`
   - OTP, lockout, attempts, refresh-token blacklist.
   - Preserve key names, TTLs, and behavior exactly.
3. `src/utils/jwt.js`
   - Access/refresh token signing and verification.
   - Introduce explicit token claims and safe verification narrowing.
4. `src/middleware/auth.middleware.js`
   - Attaches authenticated user to Express request.
   - Resolves `schoolId` for School Admin and `schoolId`/`teacherId` for Teacher.
   - This server-side scoping behavior is frozen.
5. `src/models/index.js`
   - Large raw-query model layer spanning User, Student, School, Teacher, Attendance, Fee, Timetable, Exam, Result/learning/gamification/notifications, and other domains.
   - DB row typing must be introduced without rewriting SQL or introducing an ORM.
6. Authentication, Student, School, Teacher services/controllers/routes.
   - Highest regression impact; migrate only after shared infrastructure is typed.
7. Background jobs and utilities.
   - Must preserve runtime side effects and boot order.

### Frontend

1. `src/store/authStore.js`
   - Persisted auth/session/token state and localStorage keys.
2. `src/services/api.js`
   - Axios auth header, 401 refresh, `_retry`, token replacement, login redirect.
3. `src/services/*`
   - API payload/response contracts for Student, School, Parent, Admin, Competition, auth.
4. `src/components/layout/GlobalTopbar.jsx`
   - Frozen public/global navigation behavior and role dashboard mapping.
5. App Router layouts and role routes.
6. Student portal components and School/Teacher pages.
7. Dynamic route params such as `subjects/[subjectId]`.

## Shared-domain contract strategy

Create a dedicated `shared/contracts` package as the canonical domain/API contract source. It will contain no runtime database logic and no UI logic.

Minimum contracts:

- `User`, `UserRole`, `UserStatus`
- `Student`, `StudentStatus`
- `School`, `SchoolStatus`, `SchoolPlan`
- `Teacher`, `TeacherStatus`
- `Parent`
- `SchoolClass`
- `Attendance`, `AttendanceStatus`
- `Fee`, `FeeStatus`, `PaymentMode`
- `Timetable`, `TimetablePeriod`, `DayOfWeek`
- `Exam`, `ExamType`, `ExamStatus`
- `Result`
- `Announcement`
- `ApiResponse<T>`, API error shape
- pagination request/meta/result types
- auth/session/token claims and token-pair contracts

`UserRole` is fixed to:

- `STUDENT`
- `SCHOOL_ADMIN`
- `TEACHER`
- `PARENT`
- `SUPER_ADMIN`

The shared package represents domain/API shapes. Backend-only PostgreSQL row shapes remain explicitly typed near the DB/model layer where snake_case database columns and PostgreSQL numeric/date representations can be modeled accurately. This avoids leaking storage-specific shapes into React while keeping one canonical domain vocabulary.

## Strictness policy

Final application target:

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true
}
```

Additional rules:

- No `@ts-ignore` as a migration shortcut.
- Avoid `any`; use `unknown` at external boundaries and narrow it.
- `unknown` errors must be narrowed before reading properties.
- Nullable database columns and optional API fields must be modeled explicitly.
- Typed `Request`/`Response`/`NextFunction` for Express.
- Typed authenticated request user/claims.
- Zod schemas should expose `z.infer` types rather than duplicate request-body types.
- Axios refresh config gets an explicit extension for `_retry` rather than an unchecked cast.
- Zustand stores get explicit state/action interfaces.

## Migration sequence

### Phase 1 — Foundation, tooling, shared contracts

1. Add canonical `shared/contracts` TypeScript package.
2. Add strict backend `tsconfig.json` with `src` → `dist` compilation target.
3. Add strict frontend `tsconfig.json` preserving the existing `@/*` alias.
4. Add required TypeScript/type packages to backend without upgrading existing runtime dependencies.
5. Define backend ambient Express authenticated-request augmentation or an explicit `AuthenticatedRequest` type.
6. Add migration-specific typecheck/build scripts.
7. Do not remove JS/JSX source yet.

### Phase 2 — Backend infrastructure/common

Migrate in dependency order:

1. config/env
2. logger and low-level utilities
3. DB pool/query/transaction
4. Redis
5. JWT/password/OTP/pagination/response helpers
6. error/validation/rate-limit/upload middleware
7. authentication service/controller/routes
8. common notification/fee/shared service primitives as dependency graph requires
9. backend entrypoint and boot pipeline

Gate after Phase 2:

- strict backend typecheck for migrated source
- production compile to `dist`
- backend starts from `dist/index.js`
- auth/refresh/logout regression green against disposable PostgreSQL/Redis

### Phase 3 — Backend domain APIs

Migrate while preserving SQL and URLs:

1. Student model/service/controller/routes and Student-adjacent learning/exam/portal/profile/overview services
2. School model/service/controller/routes and roster/enrollment/fee dependencies
3. Teacher behavior integrated through auth + School APIs
4. Parent existing APIs
5. Admin existing APIs
6. Competition/content/doubt/AI APIs
7. background jobs

Gate after Phase 3:

- Student API E2E green
- School API E2E green
- Teacher authentication/authorization green
- Parent/Admin/Competition route smoke green
- DB invariant suite green

### Phase 4 — Frontend infrastructure/common

Migrate in dependency order:

1. shared contracts consumption
2. Zustand stores
3. Axios API client and typed errors
4. auth and domain service modules
5. hooks
6. reusable UI helpers
7. Providers
8. global/public navigation and shared layouts

Gate after Phase 4:

- strict frontend typecheck
- public Home/login/build regression green
- role account-chip routing unchanged

### Phase 5 — Student frontend

1. `/student` shell/portal
2. Student sections
3. Student canonical App Router pages
4. dynamic subject route params
5. typed forms, payloads, API responses, errors

Gate: complete Student E2E and Student production-style smoke in disposable CI.

### Phase 6 — School/Teacher frontend

Migrate all School pages and layout without changing UI or behavior:

- overview
- enrollments
- students
- classes
- teachers
- attendance
- fees
- timetable
- exams
- results
- announcements
- profile
- onboarding

Gate: School E2E + Teacher permission/login E2E.

### Phase 7 — Parent/Admin/Competition/common frontend

Migrate existing Parent, Admin, auth, public competition, and remaining common pages. Preserve current duplicate/alias route behavior until a separate cleanup project is explicitly approved.

### Phase 8 — Deployment/PM2/scripts/CI conversion

1. Backend production script runs compiled `dist/index.js`.
2. PM2 `vs-api` must run compiled output.
3. Next.js remains normal production build/start.
4. Upgrade GitHub Actions with migration CI using disposable PostgreSQL + Redis only.
5. Preserve native Student/School smoke scripts and DB invariant assertions.
6. Commit and use deterministic package lockfiles; CI must not generate/remove lockfiles ad hoc.
7. Deployment script builds backend TypeScript before PM2 restart.
8. No production deployment from migration branch.

### Phase 9 — JS/JSX elimination and final audit

1. Remove migrated legacy `.js/.jsx` application files only after their TS/TSX replacements compile and tests pass.
2. Audit repository for remaining application `.js/.jsx`.
3. Explicitly justify any tooling JS that remains; prefer typed/config-safe replacements where supported without a framework upgrade.
4. Run full validation gate.

## Validation gate before merge

All must be green:

1. strict TypeScript typecheck
2. backend production compile
3. backend starts from compiled `dist/`
4. Next.js production build
5. authentication regression
6. Student full E2E
7. School full E2E
8. Teacher login/permission E2E
9. public navigation regression
10. database invariants
11. all canonical Student routes
12. all canonical School routes
13. Parent/Admin existing routes still build
14. native production smoke scripts against the CI environment where applicable
15. no application JS/JSX source remains unless explicitly justified

## CI design

Create a dedicated TypeScript migration workflow that:

- runs on `typescript-migration` pushes and PRs to `main`
- uses Ubuntu 22.04 + Node 20
- provisions disposable native PostgreSQL and Redis (or Actions service containers if later justified), never production services
- builds the complete schema from repository migrations/seeds
- runs DB invariants
- installs from committed lockfiles
- runs shared-contract typecheck/build
- runs backend strict typecheck + compile
- starts backend from `dist/index.js`
- runs authentication, Student, School, Teacher, and existing-domain E2E/smoke checks
- runs frontend strict typecheck + production build
- starts production Next.js and checks canonical routes
- rejects destructive deployment commands
- surfaces backend/frontend logs on failure

Existing `student-native-ci.yml`, `school-native-ci.yml`, and smoke scripts remain regression assets and should be adapted/reused rather than discarded.

## Production deployment after merge only

After every validation gate is green and the final PR is reviewed:

1. merge `typescript-migration` → `main`
2. verify exact merged `main` SHA
3. take a production PostgreSQL backup
4. verify clean VPS working tree in `/var/www/vidyasetu`
5. fetch/pull exact `main`
6. install dependencies from lockfiles
7. build shared contracts if required by package strategy
8. compile backend TypeScript to `backend/dist`
9. run Next.js production build
10. configure/restart `vs-api` against compiled `dist/index.js`
11. restart `vs-web`
12. verify PM2 status/logs
13. run Student + School production smoke scripts
14. verify Nginx/public routes and authenticated role navigation
15. verify database invariants and confirm no data-destructive operation occurred

## Non-goals for this migration

- No UI redesign.
- No route cleanup or route consolidation.
- No schema redesign.
- No ORM introduction.
- No Next.js major-version upgrade.
- No dependency modernization unrelated to TypeScript.
- No Docker replatforming of the native VPS.
- No production deployment until the full migration validation gate is green.
