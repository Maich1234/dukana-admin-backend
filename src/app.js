import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'express-async-errors';
import dotenv from 'dotenv';
import connectAdminDB from './config/adminDb.js';
import connectSmartDuka from './config/smartDukaDb.js';
import routes from './routes/v1/index.js';
import errorHandler from './middlewares/errorHandler.js';

dotenv.config();

const app = express();

// Behind Vercel's proxy — required so express-rate-limit keys on the real
// client IP (X-Forwarded-For) instead of the proxy's.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Baseline security headers (API-only equivalent of helmet's defaults).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
    'Cache-Control': 'no-store',
  });
  next();
});

// Health check stays above the DB middleware so uptime probes don't open a
// Mongo connection.
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Dukana admin API is running' });
});

// Every request needs both connections: the primary for admin-native data,
// the secondary for the shared smart-duka collections most admin/agent
// screens also touch. Opening them together keeps every route simple —
// no controller has to remember which DB(s) it depends on before querying.
app.use(async (req, res, next) => {
  try {
    await Promise.all([connectAdminDB(), connectSmartDuka()]);
    next();
  } catch (err) {
    res.status(503).json({ success: false, message: 'Database unavailable' });
  }
});

app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api/v1', routes);

app.use(errorHandler);

export default app;
