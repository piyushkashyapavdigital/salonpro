import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { ZodError } from 'zod';
import { env, integrations } from './env';
import { HttpError } from './lib/http';
import { authRouter } from './routes/auth';
import { catalogRouter } from './routes/catalog';
import { customerRouter } from './routes/customer';
import { adminRouter } from './routes/admin';
import { paymentsRouter } from './routes/payments';
import { REFUND_POLICY } from './lib/policy';

export interface BuildAppOptions {
  /** Serve the built SPA from the same process (production single-process mode). */
  serveStatic?: boolean;
}

/**
 * Construct the Express application without binding a port or touching the
 * database. Tests import this directly; `index.ts` wires it to a listener and
 * the scheduler. Keeping construction side-effect free is what lets the test
 * harness boot the API on an ephemeral port against a throwaway database.
 */
export function buildApp(options: BuildAppOptions = {}) {
  const serveStatic = options.serveStatic ?? env.serveStatic;
  const app = express();
  app.disable('x-powered-by');

  /* ---------------------------------------------------------------- */
  /* Hardening                                                         */
  /* ---------------------------------------------------------------- */

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = [env.webOrigin, `http://localhost:${env.port}`, `http://127.0.0.1:${env.port}`];
    if (origin && (allowed.includes(origin) || env.nodeEnv !== 'production')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-razorpay-signature');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  /* Webhooks need the raw body for signature verification. */
  app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '2mb' }));

  /* Tiny request log — keeps operational visibility without a dependency. */
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api') && res.statusCode >= 400 && env.nodeEnv !== 'test') {
        console.warn(`  ${res.statusCode} ${req.method} ${req.path} (${Date.now() - started}ms)`);
      }
    });
    next();
  });

  /* ---------------------------------------------------------------- */
  /* Routes                                                            */
  /* ---------------------------------------------------------------- */

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      time: new Date().toISOString(),
      nodeEnv: env.nodeEnv,
      integrations,
      policy: { refund: REFUND_POLICY },
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/customer', customerRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/admin', adminRouter);

  /* ---------------------------------------------------------------- */
  /* Static SPA (single-process production deployment)                 */
  /* ---------------------------------------------------------------- */

  const webDist = serveStatic ? path.resolve(process.cwd(), '..', 'web', 'dist') : '';
  const distExists = serveStatic && fs.existsSync(path.join(webDist, 'index.html'));
  if (distExists) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  /* ---------------------------------------------------------------- */
  /* Errors                                                            */
  /* ---------------------------------------------------------------- */

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', message: `${req.method} ${req.path} is not a route.` });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'validation_error',
        message: err.issues[0]?.message ?? 'Please check the form and try again.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    }
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error)?.message ?? 'Something went wrong.';
    if (status >= 500) console.error(err);
    res.status(status).json({ error: 'server_error', message });
  });

  return app;
}
