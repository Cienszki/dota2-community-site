import 'server-only';
import nodemailer from 'nodemailer';
import { ALLOWED_ADMIN_EMAILS } from '@/lib/admin-emails';
import type { SweptGame } from './sweep';

// Telling a human that the lobby bot is broken.
//
// Both bots run in one process, so when it dies there is nothing left on that
// side to report it — the worker's own sweeper and the Discord gateway that
// might have posted a warning go down with it. The website is the only thing
// still running, which makes this the only place the alert can come from.
//
// What it does NOT do is detect an idle outage. The worker's sole liveness
// signal is `leaseHeartbeatAt`, which exists only while it holds a lease, so a
// bot that dies overnight with no lobby open is indistinguishable from a
// healthy one until somebody tries to host. Closing that gap needs a heartbeat
// the worker writes unconditionally — asked for in docs/bot-todo.md. Until
// then this fires at the first moment the failure costs somebody something,
// which is late but never wrong.

/**
 * Quiet period between alerts.
 *
 * A broken worker fails every lobby anyone opens, so without this an outage
 * during an active evening would send a mail per attempt. One an hour is enough
 * to know; the detail is in the logs either way. In-process, like the reconcile
 * throttle — several instances each sending one an hour is still a readable
 * mailbox, and the alternative is a Firestore round trip on a path that exists
 * to report that things are already going wrong.
 */
const QUIET_PERIOD_MS = 60 * 60_000;
let lastAlertAt = 0;

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Mail the admins that the worker abandoned lobbies.
 *
 * Never throws and never blocks the caller's real work: this runs at the tail
 * of the ingest cron, and an SMTP failure must not take the ingest down with
 * it. Alerting is the least important thing that pass does.
 */
export async function alertBotTrouble(games: SweptGame[]): Promise<boolean> {
  const faults = games.filter((g) => g.fault);
  if (faults.length === 0) return false;

  const now = Date.now();
  if (now - lastAlertAt < QUIET_PERIOD_MS) return false;

  if (!smtpConfigured()) {
    console.error(
      'inhouse alert: worker faults detected but SMTP is not configured — ' +
        faults.map((f) => `#${f.gameNumber} (${f.reason})`).join(', '),
    );
    return false;
  }
  if (ALLOWED_ADMIN_EMAILS.length === 0) return false;

  // Claim the window before sending, not after. A slow SMTP server would
  // otherwise let a second caller through while the first is still waiting.
  lastAlertAt = now;

  const lines = faults.map(
    (f) =>
      `  • Gra #${f.gameNumber} — ${f.reason}, po ${f.ageMinutes} min. ` +
      `Konto bota ${f.botAccountReleased ? 'zwolnione' : 'NIE zwolnione'}. (${f.id})`,
  );

  const body = [
    `Strona zamknęła ${faults.length} ${faults.length === 1 ? 'lobby' : 'lobby'}, bo bot przestał je obsługiwać.`,
    '',
    ...lines,
    '',
    'Konta Steam wróciły do puli i limit otwartych lobby jest znowu wolny, więc',
    'społeczność nie jest zablokowana. Ale bot najprawdopodobniej nie działa —',
    'sprawdź, czy proces żyje.',
    '',
    'To powiadomienie wysyła się najwyżej raz na godzinę.',
  ].join('\n');

  try {
    const user = process.env.SMTP_USER as string;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST as string,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass: process.env.SMTP_PASS as string },
    });

    await transporter.sendMail({
      from: `PD2IH Inhouse <${user}>`,
      to: ALLOWED_ADMIN_EMAILS.join(','),
      subject: `[PD2IH] Bot lobby nie odpowiada — zamknięto ${faults.length} lobby`,
      text: body,
    });
    return true;
  } catch (err) {
    // Reset the window: nobody was told, so the next run should be free to try.
    lastAlertAt = 0;
    console.error('inhouse alert: could not send the worker-fault mail', err);
    return false;
  }
}
