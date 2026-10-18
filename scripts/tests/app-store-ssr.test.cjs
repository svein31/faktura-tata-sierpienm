require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { AppStoreProvider } = require('../../src/components/layout/app-store-provider.tsx');
const { browserAppStore, createAppStore, useAppStore } = require('../../src/lib/store.ts');

function company(ownerId, id, isDefault = true) {
  return { id, userId: ownerId, companyName: id, name: id, nip: '5260301706', isDefault,
    street: '', buildingNumber: '', flatNumber: '', city: '', postalCode: '', bankAccount: '',
    ksefToken: null, createdAt: '2026-10-16T12:00:00.000Z', updatedAt: '2026-10-16T12:00:00.000Z' };
}
function bootstrap(ownerId) {
  const companies = [company(ownerId, `${ownerId}-default`), company(ownerId, `${ownerId}-second`, false)];
  return { company: companies[0], companies, ksef: null,
    contractors: [{ id: `${ownerId}-contractor`, name: ownerId }], products: [],
    invoices: [{ id: `${ownerId}-invoice` }], notifications: [],
    notificationPrefs: { browserEnabled: false, soundEnabled: true } };
}
function Probe() {
  const companyId = useAppStore(state => state.selectedCompanyId);
  const contractors = useAppStore(state => state.contractors);
  const invoices = useAppStore(state => state.invoices);
  const hydrated = useAppStore(state => state.hydrated);
  return React.createElement('output', { 'data-company': companyId },
    JSON.stringify({ companyId, contractors: contractors.map(item => item.id), invoices: invoices.map(item => item.id), hydrated }));
}

test('SSR providers isolate two tenants without reading or mutating the imperative browser store', () => {
  const before = useAppStore.getState();
  try {
    useAppStore.setState({ company: company('global', 'global-default'), selectedCompanyId: 'global-default',
      contractors: [{ id: 'global-secret' }], invoices: [{ id: 'global-invoice' }], hydrated: true });
    const imperativeSnapshot = useAppStore.getState();
    const render = ownerId => renderToStaticMarkup(React.createElement(AppStoreProvider,
      { ownerId, initialBootstrap: bootstrap(ownerId) }, React.createElement(Probe)));
    for (const ownerId of ['tenant-a', 'tenant-b', 'tenant-a']) {
      const html = render(ownerId);
      assert.ok(html.includes(`${ownerId}-default`));
      assert.ok(html.includes(`${ownerId}-contractor`));
      assert.ok(html.includes(`${ownerId}-invoice`));
      assert.ok(html.includes('hydrated&quot;:true'));
      assert.equal(html.includes('global-secret'), false);
      assert.equal(html.includes(ownerId === 'tenant-a' ? 'tenant-b' : 'tenant-a'), false);
      assert.strictEqual(useAppStore.getState(), imperativeSnapshot, 'SSR must not replace or seed the process-global store');
    }
    const siblings = renderToStaticMarkup(React.createElement(React.Fragment, null,
      React.createElement(AppStoreProvider, { ownerId: 'tenant-a', initialBootstrap: bootstrap('tenant-a') }, React.createElement(Probe)),
      React.createElement(AppStoreProvider, { ownerId: 'tenant-b', initialBootstrap: bootstrap('tenant-b') }, React.createElement(Probe))));
    assert.equal((siblings.match(/data-company="tenant-a-default"/g) || []).length, 1);
    assert.equal((siblings.match(/data-company="tenant-b-default"/g) || []).length, 1);
    assert.strictEqual(useAppStore.getState(), imperativeSnapshot);
    assert.throws(() => browserAppStore('tenant-a', bootstrap('tenant-a')), /cannot be selected on the server/);
  } finally { useAppStore.setState(before, true); }
});

test('store factories keep selections and mutation actions local to each instance', () => {
  const first = createAppStore(bootstrap('factory-a'));
  const second = createAppStore(bootstrap('factory-b'));
  first.getState().setSelectedCompanyId('factory-a-second');
  first.getState().setDraft({ id: 'draft-a' }, false);
  assert.equal(first.getState().selectedCompanyId, 'factory-a-second');
  assert.equal(second.getState().selectedCompanyId, 'factory-b-default');
  assert.equal(second.getState().draftInvoice, null);
  first.getState().resetData();
  assert.equal(first.getState().hydrated, false);
  assert.equal(second.getState().hydrated, true);
  assert.equal(second.getState().contractors[0].id, 'factory-b-contractor');
});

test('request cancellation fences belong to each store, including independent concurrent bootstraps', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async () => new Promise(resolve => requests.push(resolve));
  try {
    const first = createAppStore();
    const second = createAppStore();
    const pendingFirst = first.getState().bootstrap('list');
    const pendingSecond = second.getState().bootstrap('list');
    requests[0](Response.json(bootstrap('request-a')));
    await pendingFirst;
    requests[1](Response.json(bootstrap('request-b')));
    await pendingSecond;
    assert.equal(first.getState().selectedCompanyId, 'request-a-default', 'Another store request must not invalidate this response');
    assert.equal(second.getState().selectedCompanyId, 'request-b-default');

    const cancelledFirst = first.getState().bootstrap('list');
    const freshSecond = second.getState().bootstrap('list');
    first.getState().resetData();
    requests[3](Response.json(bootstrap('request-b-fresh')));
    await freshSecond;
    requests[2](Response.json(bootstrap('request-a-stale')));
    await cancelledFirst;
    assert.equal(first.getState().hydrated, false, 'Reset must fence off that store stale response');
    assert.equal(first.getState().company, null);
    assert.equal(second.getState().selectedCompanyId, 'request-b-fresh-default', 'Resetting a different store must not cancel this request');
  } finally { global.fetch = originalFetch; }
});

test('browser stores preserve a warm company selection and replace all data when the actor changes', () => {
  const hadWindow = Object.hasOwn(global, 'window');
  const previousWindow = global.window;
  global.window = {};
  try {
    const first = browserAppStore('browser-a', bootstrap('browser-a'));
    first.getState().setSelectedCompanyId('browser-a-second');
    first.getState().setDraft({ id: 'actor-a-draft' }, false);
    assert.strictEqual(browserAppStore('browser-a', bootstrap('browser-a')), first);
    assert.equal(first.getState().selectedCompanyId, 'browser-a-second');

    const second = browserAppStore('browser-b', bootstrap('browser-b'));
    assert.notStrictEqual(second, first);
    assert.equal(second.getState().selectedCompanyId, 'browser-b-default');
    assert.equal(second.getState().draftInvoice, null);
    assert.equal(second.getState().contractors.some(item => item.id === 'browser-a-contractor'), false);
    assert.strictEqual(useAppStore.getState(), second.getState(), 'Imperative browser actions must target the active actor store');
  } finally {
    useAppStore.getState().resetData();
    if (hadWindow) global.window = previousWindow;
    else delete global.window;
  }
});

test('confirmed invitation actors can bootstrap and keep the newly selected company on app entry', async () => {
  const hadWindow = Object.hasOwn(global, 'window');
  const previousWindow = global.window;
  const originalFetch = global.fetch;
  global.window = {};
  global.fetch = async () => Response.json(bootstrap('invite-actor'));
  try {
    const actorStore = browserAppStore('invite-actor', null);
    assert.equal(actorStore.getState().hydrated, false);
    await actorStore.getState().bootstrap();
    actorStore.getState().setSelectedCompanyId('invite-actor-second');
    const onAppEntry = browserAppStore('invite-actor', bootstrap('invite-actor'));
    assert.strictEqual(onAppEntry, actorStore);
    assert.equal(onAppEntry.getState().selectedCompanyId, 'invite-actor-second');
  } finally {
    useAppStore.getState().resetData();
    global.fetch = originalFetch;
    if (hadWindow) global.window = previousWindow;
    else delete global.window;
  }
});
