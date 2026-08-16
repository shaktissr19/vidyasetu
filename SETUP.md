# VidyaSetu — Local Setup Guide
**Domain:** vidyasetu.sbs  
**Stack:** Node.js 20 · Next.js 14 · PostgreSQL 15 · Redis 7 · Docker

---

## Prerequisites

```bash
node --version    # ≥ 18.0.0
docker --version  # Docker Desktop or Engine
docker compose version
```

---

## 1. Clone / Unzip the Project

```
vidyasetu/
├── backend/          # Node.js + Express API
├── frontend/         # Next.js 14
├── database/
│   ├── run_all_migrations.sql   ← 30 tables, flat file for Docker
│   ├── migrations/              ← 13 individual migration files
│   └── seeds/dev_seed.sql       ← 2 schools, 12 students, all roles
└── docker-compose.yml
```

---

## 2. One-Command Start (Docker — Recommended)

```bash
cd vidyasetu

# Start everything: postgres + redis + backend + frontend
docker compose up --build

# First run: Docker auto-runs migrations + seeds on postgres init
# Wait ~60s for all services to be healthy

# Then open:
#   Frontend:  http://localhost:3000
#   Backend:   http://localhost:5000/health
```

To reset the database (re-run migrations + seed from scratch):
```bash
docker compose down -v   # -v removes volumes
docker compose up --build
```

---

## 3. Manual Start (Without Docker)

### 3a. Start Infrastructure
```bash
# PostgreSQL (needs pg 15+)
brew install postgresql@15   # macOS
brew services start postgresql@15

# Redis
brew install redis
brew services start redis

# Create database
createdb vidyasetu_db

# Run migrations
psql -U postgres -d vidyasetu_db -f database/run_all_migrations.sql

# Seed dev data
psql -U postgres -d vidyasetu_db -f database/seeds/dev_seed.sql
```

### 3b. Backend
```bash
cd backend
npm install
# .env is already configured for local dev
npm run dev
# → Server running on http://localhost:5000
```

### 3c. Frontend
```bash
cd frontend
npm install
# .env.local already has NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
npm run dev
# → App running on http://localhost:3000
```

---

## 4. Test Logins (OTP in Dev = logged to console)

In dev mode (`NODE_ENV=development`), OTP is printed to the backend console — no SMS needed.

| Role | Mobile | What you see |
|------|--------|-------------|
| **Super Admin** | `9000000000` | Analytics, all schools, revenue |
| **School Admin** | `9100000001` | Saraswati Vidya Mandir (Meerut) — PRO plan |
| **School Admin** | `9100000002` | DPS Noida — BASIC plan |
| **Student** (top performer) | `9300000002` | Priya Patel — 2800 XP, 30-day streak, 4 badges |
| **Student** (exam topper) | `9300000004` | Ananya Gupta — 4500 XP, exam topper badge |
| **Student** (new) | `9300000001` | Aarav Sharma — 1250 XP, just started |
| **Parent** | `9400000001` | Rajesh Sharma — father of Aarav + Vivek |
| **Parent** | `9400000002` | Meena Patel — mother of Priya + Neha |

**How to log in:**
1. Go to http://localhost:3000/login
2. Enter a mobile number from the table above
3. Watch the backend console for: `[MOCK SMS] To: 93XXXXXXXX | Msg: Your VidyaSetu OTP is 123456`
4. Enter that OTP — you're in

---

## 5. What's Working

### Backend API (`localhost:5000/api/v1`)
| Route | Auth | Description |
|-------|------|-------------|
| `POST /auth/send-otp` | None | Send OTP to mobile |
| `POST /auth/verify-otp` | None | Verify OTP → JWT |
| `POST /auth/refresh` | None | Refresh access token |
| `GET  /auth/me` | Any | Current user profile |
| `GET  /student/dashboard` | STUDENT | XP, attendance, subjects, exams |
| `GET  /student/subjects` | STUDENT | All NCERT subjects with progress |
| `GET  /student/attendance` | STUDENT | Monthly attendance records |
| `GET  /student/gamification` | STUDENT | Badges, XP history, streak |
| `GET  /student/leaderboard` | STUDENT | School leaderboard |
| `GET  /school/overview` | SCHOOL_ADMIN | KPIs, fee stats, class summary |
| `GET  /school/students` | SCHOOL_ADMIN | Paginated student list |
| `POST /school/attendance` | SCHOOL_ADMIN | Mark bulk attendance |
| `GET  /school/fees` | SCHOOL_ADMIN | Fee invoices with filters |
| `POST /school/fees/payment` | SCHOOL_ADMIN | Record a payment |
| `GET  /school/timetable/:classId` | SCHOOL_ADMIN | Class timetable |
| `GET  /parent/children` | PARENT | All linked children |
| `GET  /parent/children/:id/dashboard` | PARENT | Child dashboard |
| `GET  /parent/children/:id/attendance` | PARENT | Child attendance |
| `GET  /parent/children/:id/fees` | PARENT | Child fee invoices |
| `GET  /admin/analytics` | SUPER_ADMIN | Platform-wide stats |
| `GET  /admin/schools` | SUPER_ADMIN | All schools |

### Frontend Pages
| URL | Role | Status |
|-----|------|--------|
| `/login` | All | ✅ OTP flow working |
| `/dashboard` | Student | ✅ XP bar, subjects, exams |
| `/subjects` | Student | ✅ NCERT subjects + progress |
| `/gamification` | Student | ✅ Badges, XP timeline |
| `/leaderboard` | Student | ✅ Live leaderboard |
| `/attendance` | Student | ✅ Monthly calendar view |
| `/ai-tutor` | Student | ✅ VidyaBot chat (mock in dev) |
| `/school/overview` | School Admin | ✅ KPI dashboard |
| `/school/students` | School Admin | ✅ Student table with search |
| `/school/attendance` | School Admin | ✅ Bulk mark attendance |
| `/school/fees` | School Admin | ✅ Fee collection + payment |
| `/school/timetable` | School Admin | ✅ Weekly timetable |
| `/school/announcements` | School Admin | ✅ Publish announcements |
| `/parent/dashboard` | Parent | ✅ Child performance overview |
| `/parent/attendance` | Parent | ✅ Child attendance |
| `/parent/fees` | Parent | ✅ Fee status + payment link |
| `/parent/notifications` | Parent | ✅ Notification feed |
| `/admin/analytics` | Super Admin | ✅ Platform metrics |
| `/admin/schools` | Super Admin | ✅ School management |

---

## 6. Production Deployment (vidyasetu.sbs)

### Environment Variables to Update for Production

**backend/.env:**
```env
NODE_ENV=production
DB_PASSWORD=<strong_password>
JWT_ACCESS_SECRET=<64_char_random_string>
JWT_REFRESH_SECRET=<64_char_random_string>
SMS_PROVIDER=kaleyra          # or twofactor
WHATSAPP_PROVIDER=interakt    # or gupshup
AI_PROVIDER=openai            # or gemini
AWS_ACCESS_KEY_ID=<real_key>
AWS_SECRET_ACCESS_KEY=<real_secret>
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=<real_secret>
FRONTEND_URL=https://vidyasetu.sbs
```

**frontend/.env.local:**
```env
NEXT_PUBLIC_API_URL=https://api.vidyasetu.sbs/api/v1
```

### DNS Setup (vidyasetu.sbs)
```
A    @              → your_server_ip     (frontend → port 3000)
A    api            → your_server_ip     (backend  → port 5000)
```

### Nginx reverse proxy config:
```nginx
server {
    server_name vidyasetu.sbs www.vidyasetu.sbs;
    location / { proxy_pass http://localhost:3000; }
}
server {
    server_name api.vidyasetu.sbs;
    location / { proxy_pass http://localhost:5000; }
}
```

---

## 7. Known Limitations (Phase 2)

- **S3 uploads:** File uploads use mock URLs in dev. Set real AWS keys for video/PDF uploads.
- **Razorpay:** Payment link generation needs real keys. Mock flow records cash payments.
- **WhatsApp/SMS:** OTP and notifications are logged to console in dev.
- **Offline PWA:** Service Worker scaffolded. Full IndexedDB sync is Phase 2.
- **React Native app:** Mobile app is Phase 2 (scaffolded in `mobile/`).

---

## 8. Bugs Fixed in This Integration Pass

| File | Bug | Fix |
|------|-----|-----|
| `parent.service.js` | `psl.parent_id` → wrong column | → `psl.parent_user_id` |
| `parent.service.js` | `teacher_parent_messages` wrong columns | → `sender_id`, `receiver_id`, `school_id` |
| `student.service.js` | `ref_id`, `ref_type`, `note` wrong columns | → `reference_id`, `reference_type`, `description` |
| `school.service.js` | `psl.parent_id` → wrong column | → `psl.parent_user_id` |
| `feeReminder.job.js` | `psl.parent_id` → wrong column | → `psl.parent_user_id` |
| `notification.service.js` | `data`, `ref_id`, `ref_type` wrong columns | → `reference_id`, `reference_type` |
| `backend/` | `models/` directory missing entirely | → Created `models/index.js` (all 11 models) |
| `backend/` | `config/env.js` missing | → Created with Zod validation |
| `frontend/` | `store/authStore.js` missing | → Created (Zustand + persist) |
| `frontend/` | `store/languageStore.js` missing | → Created with `t(hi, en)` helper |
| `frontend/` | `hooks/useAuth.js` missing | → Created (redirect guards) |
| `frontend/` | `components/ui/index.js` missing | → Created (10 components) |
| `frontend/` | `components/layout/Navbar.jsx` missing | → Created |
| `frontend/` | `components/layout/DashSidebar.jsx` missing | → Created |
| `frontend/` | `components/layout/Providers.jsx` missing | → Created |
| `frontend/` | `utils/formatters.js` missing | → Created |
| `database/` | `run_all_migrations.sql` was using `\i` directives | → Replaced with flat concatenated file for Docker |
