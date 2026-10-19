/**
 * Serve the API from plain Node — used by the test harness and by
 * `scripts/serve.sh` for local development (the phone talks to this).
 *
 * In production the same `dispatch()` is called by a Next.js route handler on
 * Vercel; this file only exists so the API can run without Next during
 * development, where iterating on a serverless build is slower than useful.
 */
import { createServer, type Server } from 'node:http';
import { dispatch } from '../server';
import { env } from '../env';

function headersOf(nodeReq: NodeJS.ReadableStream & { headers: Record<string, string | string[] | undefined> }) {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(nodeReq.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(', ');
  }
  return headers;
}

export function createNodeServer(): Server {
  return createServer(async (nodeReq, nodeRes) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of nodeReq) chunks.push(Buffer.from(chunk as Buffer));

      const out = await dispatch({
        method: nodeReq.method ?? 'GET',
        url: nodeReq.url ?? '/',
        headers: headersOf(nodeReq as never),
        body: Buffer.concat(chunks),
      });

      nodeRes.writeHead(out.status, out.headers);
      nodeRes.end(Buffer.from(out.body));
    } catch (err) {
      /* A request stream that dies mid-body (client aborted, oversized write)
       * must not take the process down with it, and the caller deserves an
       * answer rather than a reset socket. */
      console.error('request failed', err);
      if (!nodeRes.headersSent) nodeRes.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      nodeRes.end(JSON.stringify({ error: 'server_error', message: 'The request could not be processed.' }));
    }
  });
}

export function startNodeServer(port = env.port, host = '0.0.0.0'): Server {
  const server = createNodeServer();
  server.listen(port, host, () => {
    console.log(`  SalonPro API  → http://localhost:${port}`);
    console.log(`  environment   ${env.nodeEnv}`);
  });
  return server;
}
