const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');
const { createInvoiceSearchLifecycle } = require('../../src/lib/invoice-search-lifecycle.ts');

class Target extends EventTarget {
  listeners = new Map();
  stopCalls = 0;
  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
  stop() { this.stopCalls++; }
}
function fixture(modern = true) {
  const target = new Target();
  if (modern) {
    target.navigation = new Target();
    target.NavigateEvent = { prototype: { signal: null } };
  }
  let resumes = 0, interruptions = 0;
  const lifecycle = createInvoiceSearchLifecycle(target, () => resumes++, () => interruptions++);
  const navigate = (signal, fields = {}) => {
    const event = Object.assign(new Event('navigate'), { destination: { sameDocument: false }, signal, downloadRequest: null }, fields);
    target.navigation.dispatchEvent(event);
  };
  return { target, lifecycle, navigate, get resumes() { return resumes; }, get interruptions() { return interruptions; } };
}

test('document departure cancels the debounce and blocks new work until its navigation is canceled', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), controller = new AbortController(), navigation = new AbortController();
  let starts = 0, blocked = 0;
  const timer = setTimeout(() => starts++, 200);
  const release = f.lifecycle.track(() => { clearTimeout(timer); controller.abort(); });
  assert.equal(f.target.count('beforeunload'), 1);
  f.navigate(navigation.signal);
  f.lifecycle.track(() => blocked++);
  t.mock.timers.tick(250);
  assert.equal(starts, 0);
  assert.equal(blocked, 1);
  assert.equal(controller.signal.aborted, true);
  assert.equal(f.lifecycle.departing, true);
  assert.equal(f.lifecycle.retry({ isTrusted: false }), false);
  assert.equal(f.lifecycle.departing, true);
  assert.equal(f.resumes, 0);
  navigation.abort();
  assert.equal(f.lifecycle.departing, false);
  assert.equal(f.resumes, 1);
  release(); f.lifecycle.dispose();
});

test('only the latest document navigation may resume work; framework history replacements and downloads preserve its watcher', () => {
  const f = fixture(), first = new AbortController(), second = new AbortController();
  f.navigate(first.signal); f.navigate(second.signal);
  first.abort();
  assert.equal(f.lifecycle.departing, true);
  assert.equal(f.resumes, 0);
  f.navigate(new AbortController().signal, { destination: { sameDocument: true } });
  assert.equal(f.lifecycle.departing, true);
  assert.equal(f.resumes, 0);
  f.navigate(new AbortController().signal, { downloadRequest: '' });
  assert.equal(f.lifecycle.departing, true);
  assert.equal(f.resumes, 0);
  second.abort();
  assert.equal(f.resumes, 1);
  assert.equal(f.lifecycle.departing, false);
  f.lifecycle.dispose();
});

test('pagehide rejects late cancellation and trusted retry; persisted pageshow restores search', () => {
  const f = fixture(), navigation = new AbortController();
  f.navigate(navigation.signal);
  f.target.dispatchEvent(new Event('pagehide'));
  navigation.abort();
  assert.equal(f.resumes, 0);
  assert.equal(f.lifecycle.retry({ isTrusted: true }), false);
  assert.equal(f.lifecycle.departing, true);
  f.target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
  assert.equal(f.resumes, 0);
  f.target.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(f.resumes, 1);
  assert.equal(f.lifecycle.departing, false);
  f.lifecycle.dispose();
});

for (const modern of [false, true]) test(`${modern ? 'modern' : 'legacy'} unload stops pending work without a navigate event and requires explicit navigation cancellation before retry`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(modern), request = new AbortController();
  let canceled = 0;
  let starts = 0;
  const timer = setTimeout(() => starts++, 200);
  const release = f.lifecycle.track(() => { canceled++; clearTimeout(timer); request.abort(); });
  assert.equal(f.target.count('beforeunload'), 1);
  const event = new Event('beforeunload', { cancelable: true });
  event.preventDefault(); f.target.dispatchEvent(event);
  assert.equal(canceled, 1);
  assert.equal(f.interruptions, 1);
  assert.equal(f.target.count('beforeunload'), 0);
  assert.equal(f.lifecycle.departing, true);
  assert.equal(request.signal.aborted, true);
  t.mock.timers.tick(250);
  assert.equal(starts, 0);
  // Polling refreshes, visibility changes and synthetic clicks cannot restart it.
  assert.equal(f.lifecycle.retry(), false);
  assert.equal(f.lifecycle.retry({ isTrusted: false }), false);
  assert.equal(f.lifecycle.departing, true);
  assert.equal(f.target.stopCalls, 0);
  f.target.stop = () => {
    f.target.stopCalls++;
    assert.equal(f.lifecycle.departing, true, 'the departure guard remains set until stop returns');
  };
  assert.equal(f.lifecycle.retry({ isTrusted: true }), true);
  assert.equal(f.lifecycle.departing, false);
  assert.equal(f.target.stopCalls, 1);
  release(); f.lifecycle.dispose();
});

for (const modern of [false, true]) test(`${modern ? 'modern' : 'legacy'} unload listener exists only while work is pending; old settlement cannot detach new work`, () => {
  const f = fixture(modern);
  const oldRelease = f.lifecycle.track(() => {});
  oldRelease();
  assert.equal(f.target.count('beforeunload'), 0);
  const release = f.lifecycle.track(() => {});
  oldRelease();
  assert.equal(f.target.count('beforeunload'), 1);
  release();
  assert.equal(f.target.count('beforeunload'), 0);
  assert.equal(f.lifecycle.retry({ isTrusted: true }), false);
  assert.equal(f.target.stopCalls, 0, 'an ordinary completed request retry must not stop the document');
  f.lifecycle.dispose();
});

test('trusted retry stops navigation before releasing the guard and detaches its synchronous native abort watcher', () => {
  const f = fixture(), navigation = new AbortController();
  let canceled = 0;
  f.lifecycle.track(() => canceled++);
  f.navigate(navigation.signal);
  f.target.stop = () => {
    f.target.stopCalls++;
    assert.equal(f.lifecycle.departing, true);
    navigation.abort();
    assert.equal(f.lifecycle.departing, true, 'synchronous native abort must not rearm the search during stop');
    assert.equal(f.resumes, 0);
  };
  assert.equal(f.lifecycle.retry({ isTrusted: true }), true);
  assert.equal(f.lifecycle.departing, false);
  assert.equal(f.target.stopCalls, 1);
  assert.equal(canceled, 1);
  assert.equal(f.resumes, 0, 'the caller refreshes once after explicit retry');
  f.lifecycle.dispose();
});

test('a normal active request retry never calls stop or cancels pending work', () => {
  const f = fixture();
  let canceled = 0;
  const release = f.lifecycle.track(() => canceled++);
  assert.equal(f.lifecycle.retry({ isTrusted: true }), false);
  assert.equal(f.target.stopCalls, 0);
  assert.equal(canceled, 0);
  assert.equal(f.target.count('beforeunload'), 1);
  release(); f.lifecycle.dispose();
});

test('missing or failed stop cannot release the departure guard', () => {
  const f = fixture();
  f.lifecycle.track(() => {});
  f.target.dispatchEvent(new Event('beforeunload'));
  f.target.stop = undefined;
  assert.equal(f.lifecycle.retry({ isTrusted: true }), false);
  assert.equal(f.lifecycle.departing, true);
  f.target.stop = () => { throw new Error('stop unavailable'); };
  assert.equal(f.lifecycle.retry({ isTrusted: true }), false);
  assert.equal(f.lifecycle.departing, true);
  f.target.stop = () => {};
  assert.equal(f.lifecycle.retry({ isTrusted: true }), true);
  assert.equal(f.lifecycle.departing, false);
  f.lifecycle.dispose();
});

test('pagehide or disposal during stop keeps requests blocked', () => {
  for (const action of ['pagehide', 'dispose']) {
    const f = fixture();
    f.lifecycle.track(() => {});
    f.target.dispatchEvent(new Event('beforeunload'));
    f.target.stop = () => {
      if (action === 'pagehide') f.target.dispatchEvent(new Event('pagehide'));
      else f.lifecycle.dispose();
    };
    assert.equal(f.lifecycle.retry({ isTrusted: true }), false);
    assert.equal(f.lifecycle.departing, true);
    f.lifecycle.dispose();
  }
});

test('unmount cancels in-flight work and removes every listener and navigation abort watcher', () => {
  const active = fixture(false), request = new AbortController();
  active.lifecycle.track(() => request.abort());
  active.lifecycle.dispose();
  assert.equal(request.signal.aborted, true);
  assert.equal(active.target.count('beforeunload'), 0);
  const f = fixture(), navigation = new AbortController();
  f.navigate(navigation.signal);
  f.lifecycle.dispose(); navigation.abort();
  assert.equal(f.resumes, 0);
  assert.equal(f.target.count('pagehide'), 0);
  assert.equal(f.target.count('pageshow'), 0);
  assert.equal(f.target.count('beforeunload'), 0);
  assert.equal(f.target.navigation.count('navigate'), 0);
  assert.equal(f.lifecycle.departing, true);
});

test('an already canceled native navigation resumes immediately and an ordinary download keeps work active', () => {
  const f = fixture(), navigation = new AbortController();
  let canceled = 0;
  f.lifecycle.track(() => canceled++);
  f.navigate(new AbortController().signal, { downloadRequest: '' });
  assert.equal(canceled, 0);
  navigation.abort(); f.navigate(navigation.signal);
  assert.equal(canceled, 1);
  assert.equal(f.lifecycle.departing, false);
  assert.equal(f.resumes, 1);
  f.lifecycle.dispose();
});
