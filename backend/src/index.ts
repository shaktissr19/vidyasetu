import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import logger = require('./utils/logger');
import { errorHandler, notFound } from './middleware/error.middleware';
import authRoutes = require('./routes/auth.routes');
import studentRoutes = require('./routes/student.routes');
import schoolRoutes = require('./routes/school.routes');
import parentRoutes = require('./routes/parent.routes');
import adminRoutes = require('./routes/admin.routes');
import adminLearningRoutes = require('./routes/adminLearning.routes');
import competitionRoutes = require('./routes/competition.routes');
import contentRoutes = require('./routes/content.routes');
import doubtRoutes = require('./routes/doubt.routes');
import aiRoutes = require('./routes/ai.routes');
import groupRoutes = require('./routes/group.routes');
import publicRoutes = require('./routes/public.routes');
import publicLearningRoutes = require('./routes/publicLearning.routes');
import schoolGrievanceRoutes = require('./routes/schoolGrievance.routes');
import adminGrievanceRoutes = require('./routes/adminGrievance.routes');

import './jobs/feeReminder.job';
import './jobs/attendanceAlert.job';
import './jobs/xpRecalc.job';

const app = express();

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vidyasetu-api', ts: new Date().toISOString() });
});

const API = '/api/v1';
app.use(`${API}/public/learning`, publicLearningRoutes);
app.use(`${API}/public`, publicRoutes);
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/student`, studentRoutes);
app.use(`${API}/school/grievances`, schoolGrievanceRoutes);
app.use(`${API}/school`, schoolRoutes);
app.use(`${API}/parent`, parentRoutes);
app.use(`${API}/admin/grievances`, adminGrievanceRoutes);
app.use(`${API}/admin/learning`, adminLearningRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/competition`, competitionRoutes);
app.use(`${API}/content`, contentRoutes);
app.use(`${API}/doubts`, doubtRoutes);
app.use(`${API}/ai`, aiRoutes);
app.use(`${API}/groups`, groupRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function boot(): Promise<void> {
  try {
    await connectDB();
    await connectRedis();
    app.listen(PORT, () => {
      logger.info(`VidyaSetu API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (err: unknown) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

void boot();

export = app;
