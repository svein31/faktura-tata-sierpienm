import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { assertLoopback } from './metrics.mjs';

// Targets come exclusively from fresh harness-owned worker ports. No user URL option exists.
export async function startRoundRobinProxy(origins) {
  assert.ok(origins.length > 1 && origins.length <= 4, 'A horizontal experiment needs two to four local application workers');
  const targets = origins.map(origin => new URL(assertLoopback(origin)));
  assert.ok(targets.every(target => target.protocol === 'http:' && target.hostname === '127.0.0.1'), 'Isolated worker targets must be HTTP on 127.0.0.1');
  const assignments = targets.map(() => 0);
  let next = 0;
  const proxy = createServer((incoming, outgoing) => {
    // An HTTP proxy absolute target must never override a fixed loopback upstream.
    if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) { outgoing.writeHead(400).end(); return; }
    const worker = next++ % targets.length, target = targets[worker];
    assignments[worker]++;
    const upstream = request({ hostname: target.hostname, port: target.port, method: incoming.method, path: incoming.url, headers: incoming.headers }, response => {
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
      response.on('error', () => outgoing.destroy());
    });
    upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    incoming.on('aborted', () => upstream.destroy());
    outgoing.on('close', () => upstream.destroy());
    incoming.pipe(upstream);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  return {
    origin: `http://127.0.0.1:${proxy.address().port}`,
    assignments: () => [...assignments],
    async close() { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); },
  };
}
