import { subscribeBoard } from '@/lib/inhouse/live';
import { isInhouseConfigured } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-Sent Events feed for the live board (§4.3). Each connection subscribes
// to the single shared onSnapshot; the browser's EventSource auto-reconnects,
// and LiveBoard falls back to polling /api/inhouse/board if SSE can't hold.

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export async function GET(request: Request) {
  if (!isInhouseConfigured()) {
    return new Response('event: unavailable\ndata: []\n\n', { headers: SSE_HEADERS });
  }

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (games: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(games)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const unsub = subscribeBoard(send);

      // Keep proxies from closing an idle connection.
      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(': ping\n\n'));
        } catch {
          closed = true;
        }
      }, 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
