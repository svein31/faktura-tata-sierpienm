require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const senderPath = require.resolve('../../src/lib/email/sender.ts');
const names = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'RESEND_API_KEY', 'EMAIL_FROM'];

async function withSender(callback) {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const previousFetch = global.fetch;
  const deliveries = [];
  let smtpError, pendingDelivery = false, closed = 0;
  try {
    for (const name of names) delete process.env[name];
    process.env.SMTP_HOST = 'stub.example.test';
    Module._load = function(request, parent, main) {
      if (request === 'nodemailer') return { createTransport: () => ({ close:()=>{closed++;}, sendMail: async payload => { deliveries.push(payload); if(pendingDelivery) return new Promise(()=>{}); if (smtpError) throw smtpError; return { messageId: 'stub-message-id' }; } }) };
      return originalLoad.call(this, request, parent, main);
    };
    delete require.cache[senderPath];
    const sender = require(senderPath);
    Module._load = originalLoad;
    await callback({ ...sender, deliveries, setError: error => { smtpError = error; }, holdDelivery:()=>{pendingDelivery=true;}, closed:()=>closed });
  } finally {
    Module._load = originalLoad;
    global.fetch = previousFetch;
    delete require.cache[senderPath];
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
}

const message = { to: 'recipient@example.test', subject: 'Synthetic email', text: 'test', singleAttempt: true };
test('automatic SMTP timeout has one attempt and an explicitly uncertain result', async () => {
  await withSender(async fixture => {
    fixture.setError(Object.assign(new Error('Timeout after DATA'), { code: 'ETIMEDOUT', command: 'DATA' }));
    await assert.rejects(fixture.sendEmail(message), error => error.deliveryUncertain === true);
    assert.equal(fixture.deliveries.length, 1, 'SMTP must not retry an ambiguous auto-email inside the transport');
  });
});
test('SMTP worker deadline closes the connection and leaves one ambiguous provider attempt',async()=>{
  await withSender(async fixture=>{
    fixture.holdDelivery();const controller=new AbortController();
    const delivery=fixture.sendEmail({...message,signal:controller.signal});
    controller.abort();
    await assert.rejects(delivery,error=>error.deliveryUncertain===true);
    assert.equal(fixture.deliveries.length,1);assert.equal(fixture.closed(),1);
  });
});
test('an already expired email deadline never calls the provider',async()=>{
  await withSender(async fixture=>{
    const controller=new AbortController();controller.abort();
    await assert.rejects(fixture.sendEmail({...message,signal:controller.signal}),error=>error.deliveryUncertain===false);
    assert.equal(fixture.deliveries.length,0);
  });
});
test('manual SMTP does not retry when the DATA response is lost either', async () => {
  await withSender(async fixture => {
    fixture.setError(Object.assign(new Error('Connection reset after DATA'), { code: 'ECONNRESET', command: 'DATA' }));
    await assert.rejects(fixture.sendEmail({ ...message, singleAttempt: false }), error => error.deliveryUncertain === true);
    assert.equal(fixture.deliveries.length, 1);
  });
});
test('explicit SMTP refusals and pre-connection failures are safe to schedule again', async () => {
  await withSender(async fixture => {
    for (const error of [Object.assign(new Error('Try again later'), { responseCode: 451 }), Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' }), Object.assign(new Error('Authentication refused'), { code: 'EAUTH' })]) {
      fixture.setError(error);
      await assert.rejects(fixture.sendEmail(message), result => result.deliveryUncertain === false);
    }
    assert.equal(fixture.deliveries.length, 3);
    await assert.rejects(fixture.sendEmail({ ...message, to: 'not-an-address' }), result => result.deliveryUncertain === false);
    assert.equal(fixture.deliveries.length, 3, 'Validation fails before contacting the provider');
  });
});
test('Resend carries the durable idempotency key and distinguishes HTTP rejection from a lost response', async () => {
  await withSender(async fixture => {
    delete process.env.SMTP_HOST; process.env.RESEND_API_KEY = 'synthetic-key';
    const requests = [];
    global.fetch = async (_url, request) => { requests.push(request); return Response.json({ id: 'synthetic-resend-id' }); };
    const result = await fixture.sendEmail({ ...message, idempotencyKey: 'ksef-auto-synthetic', cc: 'copy@example.test', bcc: 'hidden@example.test', attachments: [{ filename: 'test.xml', content: Buffer.from('<test/>') }] });
    assert.equal(result.provider, 'resend');
    assert.equal(requests[0].headers['Idempotency-Key'], 'ksef-auto-synthetic');
    const payload = JSON.parse(requests[0].body);
    assert.deepEqual(payload.to, ['recipient@example.test']); assert.deepEqual(payload.cc, ['copy@example.test']); assert.deepEqual(payload.bcc, ['hidden@example.test']);
    assert.equal(Buffer.from(payload.attachments[0].content, 'base64').toString(), '<test/>');
    global.fetch = async () => Response.json({ message: 'Rate limited' }, { status: 429 });
    await assert.rejects(fixture.sendEmail(message), error => error.deliveryUncertain === false);
    global.fetch = async () => { throw new Error('Lost response after submission'); };
    await assert.rejects(fixture.sendEmail(message), error => error.deliveryUncertain === true);
  });
});
