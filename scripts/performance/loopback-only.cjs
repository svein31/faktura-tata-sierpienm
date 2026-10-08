// The isolated load-test server must never contact billing, MF, email or other providers.
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const allowed = host => host === undefined || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
function check(args) {
  if (Array.isArray(args[0])) args = args[0]; // net's internally normalized argument form
  const first = args[0];
  let host;
  if (first instanceof URL) host = first.hostname;
  else if (typeof first === 'string' && /^https?:/.test(first)) host = new URL(first).hostname;
  else if (first && typeof first === 'object') host = first.hostname || first.host;
  else if (typeof first === 'number' && typeof args[1] === 'string') host = args[1];
  if (!allowed(host)) throw new Error('Isolated performance test blocked non-loopback network access');
}
const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { check(args); return originalSocketConnect.apply(this, args); };
for (const [module, names] of [[net, ['connect', 'createConnection']], [tls, ['connect']], [http, ['request', 'get']], [https, ['request', 'get']]]) {
  for (const name of names) {
    const original = module[name];
    module[name] = function (...args) { check(args); return original.apply(this, args); };
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function (resource, init) {
  const url = new URL(resource instanceof Request ? resource.url : resource);
  if (!allowed(url.hostname)) throw new Error('Isolated performance test blocked non-loopback fetch');
  return originalFetch(resource, init);
};
