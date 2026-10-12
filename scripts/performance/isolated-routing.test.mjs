import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { startRoundRobinProxy } from './isolated-routing.mjs';

test('horizontal proxy rejects all external and user-controlled destinations', async () => {
  await assert.rejects(startRoundRobinProxy(['http://127.0.0.1:1', 'https://fakturaprosto.pl']), /only loopback/);
  await assert.rejects(startRoundRobinProxy(['http://secret@127.0.0.1:1', 'http://127.0.0.1:2']), /Credentials/);
  await assert.rejects(startRoundRobinProxy(['http://localhost:1', 'http://127.0.0.1:2']), /127.0.0.1/);
});

test('horizontal proxy assigns requests in fixed round robin and preserves authentication, origin, body and status', async () => {
  const workers = [], seen = [];
  let proxy;
  try {
    for (let instance = 1; instance <= 2; instance++) {
      const server = createServer(async (incoming, outgoing) => {
        let body = ''; for await (const chunk of incoming) body += chunk;
        seen.push({ instance, method: incoming.method, path: incoming.url, cookie: incoming.headers.cookie, host: incoming.headers.host, origin: incoming.headers.origin, body });
        outgoing.writeHead(instance === 1 ? 200 : 201, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ instance }));
      });
      server.listen(0, '127.0.0.1'); await once(server, 'listening'); workers.push(server);
    }
    proxy = await startRoundRobinProxy(workers.map(server => `http://127.0.0.1:${server.address().port}`));
    for (let index = 0; index < 6; index++) {
      const response = await fetch(proxy.origin + '/api/invoices?probe=1', { method: 'POST', headers: { Cookie: 'auth_session=synthetic', Origin: proxy.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ index }) });
      assert.equal(response.status, index % 2 === 0 ? 200 : 201);
      assert.equal((await response.json()).instance, index % 2 + 1);
    }
    assert.deepEqual(proxy.assignments(), [3, 3]);
    assert.deepEqual(seen.map(entry => entry.instance), [1, 2, 1, 2, 1, 2]);
    assert.ok(seen.every(entry => entry.cookie === 'auth_session=synthetic' && entry.origin === proxy.origin && entry.host === new URL(proxy.origin).host && entry.method === 'POST' && entry.path === '/api/invoices?probe=1'));
    assert.deepEqual(seen.map(entry => JSON.parse(entry.body).index), [0, 1, 2, 3, 4, 5]);
    const escaped = request(proxy.origin, { path: 'http://external.example/api' });
    escaped.end();
    const [response] = await once(escaped, 'response'); response.resume();
    assert.equal(response.statusCode, 400); assert.deepEqual(proxy.assignments(), [3, 3]);
  } finally {
    await proxy?.close();
    await Promise.all(workers.map(async server => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }));
  }
});
