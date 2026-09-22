import express from 'express';
import { businessRouter } from './routes/business.js';
import { chatRouter } from './routes/chat.js';
import { exportRouter } from './routes/export.js';

export const app = express();
export const BUILD_VERSION = '0.3.4-chat-header';

app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));

// Transporte robusto para Netlify/serverless.
// Prioridad: header explícito > query > body original.
// El header viaja codificado para evitar problemas con caracteres no ASCII.
app.use((req, _res, next) => {
  if (req.method !== 'POST') return next();

  const encodedHeader = req.get('x-agentic-mission');
  if (typeof encodedHeader === 'string' && encodedHeader.trim()) {
    try {
      req.body = { mensaje: decodeURIComponent(encodedHeader) };
      return next();
    } catch {
      req.body = { mensaje: encodedHeader };
      return next();
    }
  }

  if (
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
