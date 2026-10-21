import { MongoClient, ObjectId } from 'mongodb';
const uri = process.env.PRODUCT_REPORT_DATABASE_URL;
if (!uri?.startsWith('mongodb')) { console.error('Set explicit read-only PRODUCT_REPORT_DATABASE_URL; DATABASE_URL is never inherited.'); process.exit(1); }
const ticket = process.argv[2];
if (ticket && !/^[a-f0-9-]{36}$/.test(ticket)) { console.error('Pass a ticket UUID or no argument.'); process.exit(1); }
const dbClient = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 5000 });
try {
  await dbClient.connect(); const db = dbClient.db(), now = new Date();
  if (ticket) {
    const report = await db.collection('SupportReport').findOne({ reference: ticket, expiresAt: { $gt: now } }, { projection: { _id: 0, requestId: 0 }, maxTimeMS: 3000 });
    let contact = null;
    if (report && /^[a-f0-9]{24}$/i.test(report.userId)) contact = await db.collection('User').findOne({ _id: new ObjectId(report.userId) }, { projection: { _id: 0, email: 1, name: 1 }, maxTimeMS: 3000 });
    if (report) delete report.userId;
    console.log(JSON.stringify({ supportReport: report, contact, handling: 'Private customer-supplied text. Keep this output out of public logs and repositories.' }));
  } else {
    const from = new Date(now.getTime() - 86400000);
    const errors = await db.collection('ProductDiagnostic').aggregate([{ $match: { receivedAt: { $gte: from }, expiresAt: { $gt: now } } }, { $group: { _id: { name: '$name', screen: '$screen', revision: '$revision', fingerprint: '$fingerprint' }, count: { $sum: 1 }, lastSeen: { $max: '$receivedAt' } } }, { $sort: { count: -1 } }, { $limit: 30 }], { maxTimeMS: 3000 }).toArray();
    const reports = await db.collection('SupportReport').find({ expiresAt: { $gt: now } }, { projection: { _id: 0, reference: 1, createdAt: 1, category: 1, screen: 1, status: 1, notification: 1 }, maxTimeMS: 3000 }).sort({ createdAt: -1 }).limit(30).toArray();
    console.log(JSON.stringify({ event: 'product_operations_report', generatedAt: now.toISOString(), errors, reports }));
  }
} catch { console.error('Product report unavailable. No raw error or credential printed.'); process.exitCode = 1; }
finally { await dbClient.close(); }
