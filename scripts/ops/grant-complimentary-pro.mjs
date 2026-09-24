import { MongoClient, ObjectId } from 'mongodb';
import { fileURLToPath } from 'node:url';

/** One-time, idempotent operator action. Never creates a Stripe customer or payment. */
export async function grantComplimentaryPro(db, emails, { apply = false } = {}) {
  if (emails.length !== 2 || new Set(emails).size !== 2 || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('Podaj dokładnie dwa różne adresy e-mail.');
  }
  const users = await db.collection('User').find({ email: { $in: emails } }, { projection: { _id: 1, email: 1 } }).toArray();
  if (users.length !== 2) throw new Error('Nie znaleziono obu kont. Nie zmieniono żadnego planu.');
  const subscriptions = await db.collection('Subscription').find({ userId: { $in: users.map(user => user._id) } }).toArray();
  if (subscriptions.some(sub => sub.stripeCustomerId || sub.stripeSubscriptionId || sub.stripePriceId)) {
    throw new Error('Jedno z kont jest połączone ze Stripe. Nie zmieniono żadnego planu; rozliczenie wymaga osobnej decyzji.');
  }
  if (subscriptions.some(sub => sub.status === 'active' && sub.accessSource !== 'complimentary')) {
    throw new Error('Jedno z kont ma już aktywny plan z innego źródła. Nie zmieniono żadnego planu.');
  }
  const result = users.map(user => ({ email: user.email, status: subscriptions.find(sub => String(sub.userId) === String(user._id))?.accessSource === 'complimentary' ? 'już przyznany' : 'do przyznania' }));
  if (!apply) return result;

  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      // Repeat checks inside the transaction so a concurrent payment cannot be overwritten.
      const current = await db.collection('Subscription').find({ userId: { $in: users.map(user => user._id) } }, { session }).toArray();
      if (current.some(sub => sub.stripeCustomerId || sub.stripeSubscriptionId || sub.stripePriceId || (sub.status === 'active' && sub.accessSource !== 'complimentary'))) {
        throw new Error('Plan zmienił się w trakcie operacji. Niczego nie nadpisano.');
      }
      const now = new Date();
      for (const user of users) {
        const existing = current.find(sub => String(sub.userId) === String(user._id));
        if (existing?.accessSource === 'complimentary' && existing.status === 'active') continue;
        if (existing) {
          await db.collection('Subscription').updateOne({ _id: existing._id, userId: user._id }, { $set: {
            plan: 'yearly', status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false,
            accessSource: 'complimentary', updatedAt: now,
          } }, { session });
        } else {
          await db.collection('Subscription').insertOne({
            _id: new ObjectId(), userId: user._id, plan: 'yearly', status: 'active',
            currentPeriodEnd: null, cancelAtPeriodEnd: false, accessSource: 'complimentary',
            stripeCustomerId: null, stripeSubscriptionId: null, stripePriceId: null,
            createdAt: now, updatedAt: now,
          }, { session });
        }
        await db.collection('_complimentaryProGrants').insertOne({ userId: user._id, email: user.email, grantedAt: now, source: 'operator-script' }, { session });
      }
    });
  } finally { await session.endSession(); }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const expectedDb = args.find(arg => arg.startsWith('--database='))?.slice('--database='.length);
  const emails = args.filter(arg => !arg.startsWith('--')).map(email => email.trim().toLowerCase());
  if (!process.env.DATABASE_URL?.startsWith('mongodb')) throw new Error('Brak DATABASE_URL w środowisku operatora.');
  const client = new MongoClient(process.env.DATABASE_URL);
  try {
    await client.connect();
    const db = client.db();
    if (!expectedDb || db.databaseName !== expectedDb || ['admin', 'local', 'config'].includes(expectedDb)) {
      throw new Error('Podaj --database=NAZWA zgodną z bazą w DATABASE_URL.');
    }
    const result = await grantComplimentaryPro(db, emails, { apply });
    console.log(JSON.stringify({ applied: apply, accounts: result }));
  } finally { await client.close(); }
}
