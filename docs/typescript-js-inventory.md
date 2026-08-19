# VidyaSetu JavaScript/JSX Migration Inventory

Baseline: `main` at `50c203ca53bca9023d5ab675f78ef9e93f2bbf78`.

This inventory covers JavaScript/JSX application source that must be migrated to TypeScript/TSX. Shell scripts, SQL, CSS, JSON, HTML demo content, and generated build output are outside the JS/JSX source count.

## Summary

| Scope | `.js` | `.jsx` | Total |
| --- | ---: | ---: | ---: |
| Backend application source | 57 | 0 | 57 |
| Frontend application source | 16 | 74 | 90 |
| **Application source total** | **73** | **74** | **147** |
| Frontend tooling/config | 3 | 0 | 3 |
| **Total including tooling/config** | **76** | **74** | **150** |

## Backend application source — 57

### Config — 4

- `backend/src/config/db.js`
- `backend/src/config/env.js`
- `backend/src/config/redis.js`
- `backend/src/config/s3.js`

### Controllers — 9

- `backend/src/controllers/admin.controller.js`
- `backend/src/controllers/auth.controller.js`
- `backend/src/controllers/competition.controller.js`
- `backend/src/controllers/content.controller.js`
- `backend/src/controllers/doubt.controller.js`
- `backend/src/controllers/enrollment.controller.js`
- `backend/src/controllers/parent.controller.js`
- `backend/src/controllers/school.controller.js`
- `backend/src/controllers/student.controller.js`

### Entrypoint — 1

- `backend/src/index.js`

### Jobs — 3

- `backend/src/jobs/attendanceAlert.job.js`
- `backend/src/jobs/feeReminder.job.js`
- `backend/src/jobs/xpRecalc.job.js`

### Middleware — 5

- `backend/src/middleware/auth.middleware.js`
- `backend/src/middleware/error.middleware.js`
- `backend/src/middleware/rateLimit.middleware.js`
- `backend/src/middleware/upload.middleware.js`
- `backend/src/middleware/validate.middleware.js`

### Models — 1

- `backend/src/models/index.js`

### Routes — 9

- `backend/src/routes/admin.routes.js`
- `backend/src/routes/ai.routes.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/routes/competition.routes.js`
- `backend/src/routes/content.routes.js`
- `backend/src/routes/doubt.routes.js`
- `backend/src/routes/parent.routes.js`
- `backend/src/routes/school.routes.js`
- `backend/src/routes/student.routes.js`

### Services — 19

- `backend/src/services/academicCompetition.service.js`
- `backend/src/services/academicLearning.service.js`
- `backend/src/services/admin.service.js`
- `backend/src/services/ai.service.js`
- `backend/src/services/auth.service.js`
- `backend/src/services/competition.service.js`
- `backend/src/services/content.service.js`
- `backend/src/services/enrollment.service.js`
- `backend/src/services/fee.service.js`
- `backend/src/services/notification.service.js`
- `backend/src/services/parent.service.js`
- `backend/src/services/school.service.js`
- `backend/src/services/schoolRoster.service.js`
- `backend/src/services/student.service.js`
- `backend/src/services/studentExam.service.js`
- `backend/src/services/studentLearning.service.js`
- `backend/src/services/studentOverview.service.js`
- `backend/src/services/studentPortal.service.js`
- `backend/src/services/studentProfile.service.js`

### Utilities — 6

- `backend/src/utils/jwt.js`
- `backend/src/utils/logger.js`
- `backend/src/utils/otp.js`
- `backend/src/utils/paginate.js`
- `backend/src/utils/password.js`
- `backend/src/utils/response.js`

## Frontend application JSX — 74

### App Router — 57

#### Admin route group — 17

- `frontend/src/app/(admin)/admin/analytics/page.jsx`
- `frontend/src/app/(admin)/admin/competitions/page.jsx`
- `frontend/src/app/(admin)/admin/content/page.jsx`
- `frontend/src/app/(admin)/admin/revenue/page.jsx`
- `frontend/src/app/(admin)/admin/schools/page.jsx`
- `frontend/src/app/(admin)/admin/settings/page.jsx`
- `frontend/src/app/(admin)/admin/support/page.jsx`
- `frontend/src/app/(admin)/admin/users/page.jsx`
- `frontend/src/app/(admin)/analytics/page.jsx`
- `frontend/src/app/(admin)/competitions/page.jsx`
- `frontend/src/app/(admin)/content/page.jsx`
- `frontend/src/app/(admin)/layout.jsx`
- `frontend/src/app/(admin)/revenue/page.jsx`
- `frontend/src/app/(admin)/schools/page.jsx`
- `frontend/src/app/(admin)/settings/page.jsx`
- `frontend/src/app/(admin)/support/page.jsx`
- `frontend/src/app/(admin)/users/page.jsx`

#### Auth route group — 3

- `frontend/src/app/(auth)/layout.jsx`
- `frontend/src/app/(auth)/login/page.jsx`
- `frontend/src/app/(auth)/register/page.jsx`

#### Parent route group — 9

- `frontend/src/app/(parent)/dashboard/page.jsx`
- `frontend/src/app/(parent)/layout.jsx`
- `frontend/src/app/(parent)/messages/page.jsx`
- `frontend/src/app/(parent)/notifications/page.jsx`
- `frontend/src/app/(parent)/parent/attendance/page.jsx`
- `frontend/src/app/(parent)/parent/dashboard/page.jsx`
- `frontend/src/app/(parent)/parent/fees/page.jsx`
- `frontend/src/app/(parent)/parent/messages/page.jsx`
- `frontend/src/app/(parent)/parent/notifications/page.jsx`

#### School route group — 14

- `frontend/src/app/(school)/layout.jsx`
- `frontend/src/app/(school)/school/announcements/page.jsx`
- `frontend/src/app/(school)/school/attendance/page.jsx`
- `frontend/src/app/(school)/school/classes/page.jsx`
- `frontend/src/app/(school)/school/enrollments/page.jsx`
- `frontend/src/app/(school)/school/exams/page.jsx`
- `frontend/src/app/(school)/school/fees/page.jsx`
- `frontend/src/app/(school)/school/onboarding/page.jsx`
- `frontend/src/app/(school)/school/overview/page.jsx`
- `frontend/src/app/(school)/school/profile/page.jsx`
- `frontend/src/app/(school)/school/results/page.jsx`
- `frontend/src/app/(school)/school/students/page.jsx`
- `frontend/src/app/(school)/school/teachers/page.jsx`
- `frontend/src/app/(school)/school/timetable/page.jsx`

#### Student route group — 10

- `frontend/src/app/(student)/ai-tutor/page.jsx`
- `frontend/src/app/(student)/doubts/page.jsx`
- `frontend/src/app/(student)/exams/page.jsx`
- `frontend/src/app/(student)/gamification/page.jsx`
- `frontend/src/app/(student)/layout.jsx`
- `frontend/src/app/(student)/leaderboard/page.jsx`
- `frontend/src/app/(student)/offline/page.jsx`
- `frontend/src/app/(student)/report-card/page.jsx`
- `frontend/src/app/(student)/subjects/[subjectId]/page.jsx`
- `frontend/src/app/(student)/subjects/page.jsx`

#### Root/public routes — 4

- `frontend/src/app/competition/page.jsx`
- `frontend/src/app/layout.jsx`
- `frontend/src/app/page.jsx`
- `frontend/src/app/student/page.jsx`

### React components — 17

#### Layout components — 4

- `frontend/src/components/layout/DashSidebar.jsx`
- `frontend/src/components/layout/GlobalTopbar.jsx`
- `frontend/src/components/layout/Navbar.jsx`
- `frontend/src/components/layout/Providers.jsx`

#### Student portal — 13

- `frontend/src/components/student/StudentPortal.jsx`
- `frontend/src/components/student/sections/AITutorSection.jsx`
- `frontend/src/components/student/sections/AttendanceSection.jsx`
- `frontend/src/components/student/sections/DashboardSection.jsx`
- `frontend/src/components/student/sections/DoubtForumSection.jsx`
- `frontend/src/components/student/sections/ExamsSection.jsx`
- `frontend/src/components/student/sections/GamificationSection.jsx`
- `frontend/src/components/student/sections/LeaderboardSection.jsx`
- `frontend/src/components/student/sections/MySchoolSection.jsx`
- `frontend/src/components/student/sections/OfflineSection.jsx`
- `frontend/src/components/student/sections/ProfileSecuritySection.jsx`
- `frontend/src/components/student/sections/ReportCardSection.jsx`
- `frontend/src/components/student/sections/SubjectsSection.jsx`

## Frontend application JavaScript — 16

### UI helper — 1

- `frontend/src/components/ui/index.js`

### Hooks — 2

- `frontend/src/hooks/useAuth.js`
- `frontend/src/hooks/useOffline.js`

### API/services — 10

- `frontend/src/services/adminService.js`
- `frontend/src/services/aiService.js`
- `frontend/src/services/api.js`
- `frontend/src/services/authService.js`
- `frontend/src/services/competitionService.js`
- `frontend/src/services/contentService.js`
- `frontend/src/services/doubtService.js`
- `frontend/src/services/parentService.js`
- `frontend/src/services/schoolService.js`
- `frontend/src/services/studentService.js`

### Zustand stores — 2

- `frontend/src/store/authStore.js`
- `frontend/src/store/languageStore.js`

### Utilities — 1

- `frontend/src/utils/formatters.js`

## Frontend tooling/config JavaScript — 3

- `frontend/next.config.js`
- `frontend/postcss.config.js`
- `frontend/tailwind.config.js`

## Explicitly not counted as application JS/JSX

- shell deployment/cutover/smoke scripts under `scripts/`
- SQL migrations/seeds under `database/`
- CSS and CSS modules
- HTML demo content under `frontend/public/demo-content/`
- JSON manifests/package metadata
- generated Next.js output, backend `dist/`, node_modules, logs, coverage, and other build/runtime artifacts

This file is the baseline checklist for Phase 9. Every application-source item above must either be replaced by a strict `.ts/.tsx` equivalent and removed, or receive an explicit final-PR justification if it is intentionally retained as tooling rather than application source.
