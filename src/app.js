import express from 'express';
import { businessRouter } from './routes/business.js';
import { chatRouter } from './routes/chat.js';
import { exportRouter } from './routes/export.js';

export const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  });
});

app.get('/api/estado', (_req, res) => {
  res.json({ disponible: true, persistencia: 'supabase', modo: 'serverless-ready' });
});

app.use('/api', businessRouter, chatRouter, exportRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number(error?.statusCode) || 500;
  res.status(status).json({ error: error?.message || 'Error interno.' });
});
