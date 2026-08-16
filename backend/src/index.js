require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const { connectDB } = require('./config/db');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/error.middleware');
const { notFound } = require('./middleware/error.middleware');

// Route imports
const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/student.routes');
const schoolRoutes = require('./routes/school.routes');
const parentRoutes = require('./routes/parent.routes');
const adminRoutes = require('./routes/admin.routes');
const competitionRoutes = require('./routes/competition.routes');
const contentRoutes = require('./routes/content.routes');
const doubtRoutes = require('./routes/doubt.routes');
const aiRoutes    = require('./routes/ai.routes');

// Background jobs
require('./jobs/feeReminder.job');
require('./jobs/attendanceAlert.job');
require('./jobs/xpRecalc.job');

const app = express();

// ── Security & Parsing ─────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Health check ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'vidyasetu-api', ts: new Date().toISOString() });
});

// ── API Routes ─────────────────────────────────────────────
const API = '/api/v1';
app.use(`${API}/auth`,         authRoutes);
app.use(`${API}/student`,      studentRoutes);
app.use(`${API}/school`,       schoolRoutes);
app.use(`${API}/parent`,       parentRoutes);
app.use(`${API}/admin`,        adminRoutes);
app.use(`${API}/competition`,  competitionRoutes);
app.use(`${API}/content`,      contentRoutes);
app.use(`${API}/doubts`,       doubtRoutes);
app.use(`${API}/ai`,          aiRoutes);

// ── Error Handling ─────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Boot ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function boot() {
  try {
    await connectDB();
    await connectRedis();
    app.listen(PORT, () => {
      logger.info(`VidyaSetu API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

boot();

module.exports = app; // for tests
