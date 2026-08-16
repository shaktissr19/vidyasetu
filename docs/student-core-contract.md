# VidyaSetu Student Core Contract

This document freezes the Phase 1 database contract for the Student foundation. The PostgreSQL migrations are the source of truth. Backend and frontend code must conform to these names and enum values rather than introducing alternate field names.

## Scope

Phase 1 covers the data foundation required by the target Student experience:

- Student identity and school/class membership
- Dashboard KPIs
- Attendance
- Learning subjects, chapters and content progress
- Quiz progress
- XP, levels, streaks and badges
- Class/school leaderboard
- School-test report-card reads

Authentication onboarding, full frontend wiring, competitions, doubt forum, school ERP, parent portal and real offline sync are separate phases.

## Canonical tables

### Identity

- `users`
- `students`
- `schools`
- `school_classes`
- `parent_student_links`

Important Student columns:

- `students.user_id`
- `students.school_id`
- `students.class_id`
- `students.academic_year`
- `students.xp_total`
- `students.xp_level`
- `students.streak_current`
- `students.streak_best`
- `students.last_activity`

Do not use `last_activity_date`; it is not part of the schema.

### Attendance

- `attendance`
- `attendance_monthly_summary`

Monthly summary columns:

- `working_days`
- `present_days`
- `absent_days`
- `late_days`
- `half_days`
- `percentage`

Do not use `total_days`; it is not part of the schema.

### Learning content

- `subjects`
- `chapters`
- `content_items`
- `quiz_questions`
- `student_content_progress`
- `offline_downloads`

`content_items` owns the content XP value through `xp_reward`.

`quiz_questions` does not contain per-question `marks` or `xp_reward` fields. Quiz score is calculated from correct answers and the content item reward is granted once on first passing completion.

`content_items` does not contain `subject_id` or `class_name`; those relationships are derived through `chapter_id -> chapters`.

### Gamification

- `xp_events`
- `badges`
- `student_badges`
- `streak_log`

Canonical `xp_event_type` values:

- `LESSON_COMPLETE`
- `QUIZ_PASS`
- `QUIZ_PERFECT`
- `STREAK_BONUS`
- `EXAM_COMPLETE`
- `EXAM_TOP_10`
- `EXAM_TOP_3`
- `FIRST_LOGIN`
- `PROFILE_COMPLETE`
- `DOUBT_ANSWERED`
- `DOUBT_UPVOTED`
- `DAILY_LOGIN`

Do not write `BADGE_EARNED`, `EXAM_SUBMIT` or `EXAM_TOP10`; they are not valid enum values.

Canonical badge catalogue currently includes:

- `FIRST_STEP`
- `CURIOUS_MIND`
- `WEEK_WARRIOR`
- `MONTH_MASTER`
- `XP_500`
- `XP_2000`
- `XP_5000`
- `XP_10000`
- `QUIZ_MASTER`
- `EXAM_TOPPER`

Use `badges.xp_bonus`, not `xp_reward`.

`streak_log` uses `date`, not `activity_date`.

## Exams used by Student report-card reads

Phase 1 only normalizes Student-side reads against the current exam schema.

Canonical values:

- Exam type: `SCHOOL_TEST`
- Attempt status: `SCORED`
- Student score column: `exam_attempts.total_marks`
- Subjects: `exams.subject_codes` (`TEXT[]`)

Do not use `SCHOOL_EXAM`, `EVALUATED`, `exam_attempts.score`, or `exams.subject_id`.

The full Competition/Olympiad write flow is intentionally deferred to its dedicated integration phase.

## API naming rule

New and normalized API DTOs use camelCase. PostgreSQL column names remain snake_case internally.

Examples:

- `xp_total` -> `xpTotal`
- `xp_level` -> `xpLevel`
- `streak_current` -> `streakCurrent`
- `class_name` -> `className`
- `school_name` -> `schoolName`

Frontend code should be updated to consume the canonical camelCase DTO rather than asking the backend to expose duplicate snake_case aliases.

## Student dashboard contract

`GET /api/v1/student/dashboard` must provide enough real data for the target dashboard without hard-coded UI values:

- Student identity
- Class and school
- XP and level
- Current/best streak
- Badge count
- Today's attendance
- Current-month attendance summary
- Subject progress
- Upcoming eligible exams
- Class rank
- School rank
- Class leaderboard
- Recent XP activity

## Phase 1 business rules

1. Completing a published non-quiz content item records `student_content_progress` and awards `content_items.xp_reward` exactly once.
2. Quiz completion is recorded only through quiz submission.
3. A quiz passes at 60% or above.
4. Quiz XP is awarded once on the first passing attempt.
5. A 100% first passing attempt uses the `QUIZ_PERFECT` XP event; other passing attempts use `QUIZ_PASS`.
6. Daily streak state is stored using `students.last_activity` and `streak_log.date`.
7. Badge assignment uses the existing seeded badge codes.
8. Badge `xp_bonus` is retained as catalogue metadata in Phase 1 because the current `xp_event_type` enum has no `BADGE_EARNED` value. No invalid XP event is written.
9. Leaderboards are based on `students.xp_total` and active students only.
10. Report-card reads use `SCHOOL_TEST` + `SCORED` records from the current exam schema.

## Phase 1B development seed invariants

Fresh Docker database initialization now runs:

```text
01_schema.sql
02_seed.sql
03_student_seed_reconcile.sql
04_student_seed_validate.sql
```

The original development seed stores rich demo XP/streak snapshots while inserting only a small recent XP-event window. Since `xp_events` is the canonical XP ledger, `03_student_seed_reconcile.sql` adds an older development-only baseline event so the intended demo totals and the ledger agree exactly.

The reconciliation step also:

- rebuilds seeded streak history relative to `CURRENT_DATE` instead of fixed 2025 dates;
- sets `students.last_activity` consistently;
- adds enough historical lesson events for Priya to legitimately meet `CURIOUS_MIND`;
- inserts missing criteria-based Student badges without deleting hand-picked demo badges.

`04_student_seed_validate.sql` intentionally fails fresh Docker database initialization if any core Student invariant breaks, including:

- Student → user/school/class relationship integrity;
- `students.xp_total = SUM(xp_events.xp_amount)`;
- canonical XP-level calculation;
- active streak ledger consistency;
- existence of Aarav/Priya smoke-test accounts;
- Priya's intended 2800-XP / 30-day demo snapshot.

These reconciliation/validation scripts are development-seed safeguards only. They do not change production business rules or the canonical migrations.

## Deferred items

The following are intentionally not solved in Phase 1:

- New-student onboarding after OTP verification
- Student frontend dashboard DTO conversion
- Parent notifications and messaging
- School attendance/fee write flows
- Competition/Olympiad schema normalization
- Doubt forum schema normalization
- Real service-worker/IndexedDB offline sync
- Production SMS/WhatsApp/Razorpay/S3 setup
