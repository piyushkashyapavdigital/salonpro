import { env, integrations } from './env';
import { migrate, all, run, closeDatabase } from './db';
import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import { buildApp } from './app';
import { runReminderPass, scheduleAppointmentReminders } from './services/notifications';

/** Never print the password portion of the connection string. */
function safeDatabaseLabel() {
  if (env.databaseUrl.startsWith('pglite:')) return `embedded postgres (${env.databaseUrl.slice('pglite:'.length) || 'memory'})`;
  try {
    const url = new URL(env.databaseUrl);
    return `${url.hostname}${url.pathname}${url.searchParams.get('sslmode') ? ` (sslmode=${url.searchParams.get('sslmode')})` : ''}`;
  } catch {
    return 'external postgres';
  }
}

const app = buildApp();

/* ------------------------------------------------------------------ */
/* Scheduled jobs                                                      */
/* ------------------------------------------------------------------ */

/**
 * Reminder scheduler. Runs every 15 minutes and uses each salon's own timezone
 * awareness (Asia/Kolkata by default). Duplicate sends are structurally
 * impossible: the reminder key is unique per customer + visit + stage.
 */
async function startScheduler() {
  const salons = await all<{ id: string; name: string }>('SELECT id, name FROM salons');
  if (!salons.length) {
    console.log('· scheduler idle — no salon rows yet (run `npm run seed` in development)');
    return;
  }
  cron.schedule('*/15 * * * *', async () => {
    const stamp = new Date().toISOString();
    for (const salon of salons) {
      try {
        const result = await runReminderPass(salon.id);
        if (result.queued || result.pending || result.suppressed) {
          console.log(
            `  reminder pass ${salon.name}: scanned ${result.scanned}, queued ${result.queued}, pending ${result.pending}, suppressed ${result.suppressed}, skipped ${result.skipped}`,
          );
        }
      } catch (err) {
        console.error(`  reminder pass failed for ${salon.name}:`, (err as Error).message);
      }
    }
    await run('UPDATE app_meta SET lastReminderRunAt = ? WHERE id = 1', stamp);
  });

  /* Appointment reminders at 09:00 daily. */
  cron.schedule('0 9 * * *', async () => {
    for (const salon of salons) await scheduleAppointmentReminders(salon.id);
  });

  console.log('· reminder scheduler running (every 15 minutes)');
}

async function main() {
  await migrate();

  const server = app.listen(env.port, () => {
    console.log('');
    console.log('  SalonPro API');
    console.log(`  → http://localhost:${env.port}`);
    console.log(`  database      ${safeDatabaseLabel()}`);
    console.log(`  razorpay      ${integrations.razorpayLive ? 'LIVE keys configured' : 'simulated test mode (no keys)'}`);
    console.log(`  whatsapp      ${integrations.whatsapp ? 'configured' : 'not configured — reminders recorded as pending (never "sent")'}`);
    console.log(`  web push      ${integrations.push ? 'configured' : 'not configured'}`);
    console.log(`  otp delivery  ${integrations.otpDelivery ? 'provider' : 'DEV MOCK (code returned to the client; disabled when NODE_ENV=production)'}`);
    if (env.serveStatic) {
      const dist = path.resolve(process.cwd(), '..', 'web', 'dist', 'index.html');
      console.log(`  serving SPA   ${fs.existsSync(dist) ? dist : '(not built — run npm run build)'}`);
    }
    console.log('');
    void startScheduler();
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`\n· ${signal} — shutting down`);
      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
    });
  }
}

void main();
