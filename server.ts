import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createApp, paymentSummary } from './server/app.js';
import { NOTIFY_EMAIL, smtpConfigured } from './server/mailer.js';
import { storageMode } from './server/orders.js';

// Long-running server (local development, Cloud Run, any Node hosting).
// On Vercel the same API runs as a serverless function from api/index.ts.
async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(distPath, { maxAge: '1d', index: false }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`  Pago: ${paymentSummary()}`);
    console.log(`  Correo: ${smtpConfigured() ? `activo → ${NOTIFY_EMAIL}` : 'NO configurado (define SMTP_USER y SMTP_PASS)'}`);
    console.log(`  Pedidos: ${storageMode()}`);
  });
}

startServer();
