import express from 'express';
import { businessRouter } from './routes/business.js';
import { chatRouter } from './routes/chat.js';
import { exportRouter } from './routes/export.js';

export const app = express();
export const BUILD_VERSION = '0.3.3-chat-query-direct';

app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));

// Netlify puede reescribir /api/chat antes de que Express vea la ruta original.
// Por eso no dependemos de req.path: cualquier POST que transporte `mensaje`
// en query puede reconstruir el body si el adaptador serverless lo perdió.
app.use((req, _res, next) => {
  if (
    req.method === 'POST' &&
    typeof req.query?.mensaje === 'string' &&
    (
      req.body == null ||
      req.body === '' ||
      (typeof req.body === 'object' && Object.keys(req.body).length === 0)
    )
  ) {
    req.body = { mensaje: req.query.mensaje };
  }
  next();
});

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  });
});

app.get('/api/estado', (_req, res) => {
  res.json({
    disponible: true,
    persistencia: 'supabase',
    modo: 'serverless-ready',
    build: BUILD_VERSION,
  });
});

app.use('/api', businessRouter, chatRouter, exportRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number(error?.statusCode) || 500;
  res.status(status).json({ error: error?.message || 'Error interno.' });
});
