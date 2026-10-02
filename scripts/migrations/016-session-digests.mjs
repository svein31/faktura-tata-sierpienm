import { createHash } from 'node:crypto';
export const id = '016-session-digests';
export async function plan() { return {}; }
export async function up(db) {
  for await (const session of db.collection('Session').find({ sessionToken: { $type: 'string', $not: /^sha256:[a-f0-9]{64}$/ } })) {
    const digest = 'sha256:' + createHash('sha256').update(session.sessionToken).digest('hex');
    await db.collection('Session').updateOne({ _id: session._id, sessionToken: session.sessionToken }, { $set: { sessionToken: digest } });
  }
}
export async function down() { throw new Error('Session digests are irreversible. Retain compatible authentication code or explicitly revoke sessions.'); }
