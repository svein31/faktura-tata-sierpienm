import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { PrismaClient } from '@prisma/client';
import * as migration from './migrations/022-subscription-nullable-identifiers.mjs';
import { migrateData } from './migrate-data.mjs';
import { grantComplimentaryPro } from './ops/grant-complimentary-pro.mjs';

/** Native Mongo regression, called only by the isolated replica-set harness. */
export async function checkSubscriptionNullableIndexes(client, { databaseUrl } = {}) {
  assert.ok(client.options.hosts?.length && client.options.hosts.every(address => ['127.0.0.1', 'localhost', '::1'].includes(address.host)), 'Nullable index regression requires a loopback-only isolated MongoDB client');
  const parsed = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'Prisma regression requires the same isolated loopback target');
  const marker = randomBytes(6).toString('hex'), databases = [];
  const checks = [];
  const database = suffix => {
    const db = client.db(`qa_sub_nullable_${marker}_${suffix}`);
    databases.push(db);return db;
  };
  const indexes = async db => (await db.collection('Subscription').listIndexes().toArray()).filter(index => index.name !== '_id_' && index.name !== 'Subscription_userId_key');
  const comparable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const fields = ['stripeCustomerId', 'stripeSubscriptionId'];
  const setup = async (db, sparse = false) => {
    await db.collection('Subscription').createIndex({ userId: 1 }, { name: 'Subscription_userId_key', unique: true });
    for (const field of fields) await db.collection('Subscription').createIndex({ [field]: 1 }, { name: `Subscription_${field}_key`, unique: true, ...(sparse ? { sparse: true } : {}) });
  };
  const row = (ids = {}) => ({ _id: new ObjectId(), userId: new ObjectId(), ...ids });
  const duplicate = async fn => assert.rejects(fn, error => error.code === 11000);
  try {
    const nonSparse = database('nonsparse');await setup(nonSparse);
    const records = nonSparse.collection('Subscription');
    await records.insertOne(row());
    await duplicate(() => records.insertOne(row()));
    await duplicate(() => records.insertOne(row({stripeCustomerId:null,stripeSubscriptionId:null})));
    const paid=row({stripeCustomerId:'cus_qa_preserved_paid',stripeSubscriptionId:'sub_qa_preserved_paid',stripePriceId:'price_qa_preserved_paid',plan:'monthly',status:'active',currentPeriodEnd:new Date(Date.now()+86400000),cancelAtPeriodEnd:false});
    await records.insertOne(paid);
    await duplicate(()=>records.insertOne(row({stripeCustomerId:paid.stripeCustomerId,stripeSubscriptionId:'sub_qa_old_other'})));
    await duplicate(()=>records.insertOne(row({stripeCustomerId:'cus_qa_old_other',stripeSubscriptionId:paid.stripeSubscriptionId})));
    const initialRecords = await records.find({}).toArray();
    const beforeIndexes = await indexes(nonSparse);
    const checkpoint = await migration.plan(nonSparse);
    assert.equal(checkpoint.entries.length,2);
    await migration.up(nonSparse,checkpoint);await migration.up(nonSparse,checkpoint);
    assert.equal((await migration.plan(nonSparse)).entries.length,0);
    assert.deepEqual(await records.find({}).toArray(),initialRecords,'Index migration must preserve every stored record');
    for(const index of await indexes(nonSparse)) {
      const field=Object.keys(index.key)[0];assert.equal(index.unique,true);assert.deepEqual(index.partialFilterExpression,{[field]:{$type:'string'}});assert.equal(index.sparse,undefined);
    }
    await migration.down(nonSparse,checkpoint);await migration.down(nonSparse,checkpoint);
    assert.equal(comparable(await indexes(nonSparse)),comparable(beforeIndexes),'Rollback must restore the actual prior non-sparse definitions');
    await duplicate(()=>records.insertOne(row()));
    await duplicate(()=>records.insertOne(row({stripeCustomerId:paid.stripeCustomerId,stripeSubscriptionId:'sub_qa_rollback_other'})));
    await duplicate(()=>records.insertOne(row({stripeCustomerId:'cus_qa_rollback_other',stripeSubscriptionId:paid.stripeSubscriptionId})));
    await migration.up(nonSparse,checkpoint);
    await records.insertMany([
      row(),row({stripeCustomerId:'cus_qa_pending_one'}),row({stripeCustomerId:'cus_qa_pending_two'}),
      row({stripeCustomerId:'cus_qa_real_one',stripeSubscriptionId:'sub_qa_real_one'}),
    ]);
    await duplicate(()=>records.insertOne(row({stripeCustomerId:'cus_qa_real_one',stripeSubscriptionId:'sub_qa_other'})));
    await duplicate(()=>records.insertOne(row({stripeCustomerId:'cus_qa_other',stripeSubscriptionId:'sub_qa_real_one'})));
    const grantUsers=['one','two'].map(label=>({_id:new ObjectId(),email:`grant-${label}-${marker}@example.test`}));
    await nonSparse.collection('User').insertMany(grantUsers);
    const grantEmails=grantUsers.map(user=>user.email);
    const beforePreview=await records.countDocuments();
    await grantComplimentaryPro(nonSparse,grantEmails);
    assert.equal(await records.countDocuments(),beforePreview);
    await grantComplimentaryPro(nonSparse,grantEmails,{apply:true});
    await grantComplimentaryPro(nonSparse,grantEmails,{apply:true});
    const granted=await records.find({userId:{$in:grantUsers.map(user=>user._id)}}).toArray();
    assert.equal(granted.length,2);assert.ok(granted.every(value=>value.stripeCustomerId===null && value.stripeSubscriptionId===null && value.accessSource==='complimentary' && value.status==='active'));
    assert.equal(await nonSparse.collection('_complimentaryProGrants').countDocuments(),2);
    assert.deepEqual(await records.findOne({_id:paid._id}),paid,'Migration and grants must never mutate the existing paid Stripe record');
    const beforeRefusal=comparable(await indexes(nonSparse));
    const dataBeforeRefusal=await records.find({}).toArray();
    await assert.rejects(migration.down(nonSparse,checkpoint),/Rollback of migration 022 is impossible/);
    assert.equal(comparable(await indexes(nonSparse)),beforeRefusal,'Impossible rollback must leave both unique partial indexes intact');
    assert.deepEqual(await records.find({}).toArray(),dataBeforeRefusal);
    checks.push('Non-sparse missing/null collisions reproduce; partial up/up preserves records, down/down restores exact options, two pending customers and two idempotent complimentary grants coexist, real Stripe IDs remain unique, impossible rollback changes no data/index');

    const sparse=database('sparse');await setup(sparse,true);
    const sparseRecords=sparse.collection('Subscription');
    await sparseRecords.insertMany([row(),row(),row({stripeCustomerId:null,stripeSubscriptionId:null})]);
    await duplicate(()=>sparseRecords.insertOne(row({stripeCustomerId:null,stripeSubscriptionId:null})));
    const sparseBefore=await indexes(sparse), sparseCheckpoint=await migration.plan(sparse);
    await migration.up(sparse,sparseCheckpoint);await migration.down(sparse,sparseCheckpoint);
    assert.equal(comparable(await indexes(sparse)),comparable(sparseBefore),'Historical sparse option must survive rollback');
    await migration.up(sparse,sparseCheckpoint);
    await sparseRecords.insertOne(row({stripeCustomerId:null,stripeSubscriptionId:null}));
    await assert.rejects(migration.down(sparse,sparseCheckpoint),/Rollback of migration 022 is impossible/);
    checks.push('Migration014-style sparse indexes still reject duplicate explicit null; 022 fixes that shape and restores sparse options only when rollback is possible');

    const duplicateDb=database('duplicate_strings');
    await duplicateDb.collection('Subscription').insertMany([row({stripeCustomerId:'cus_qa_duplicate'}),row({stripeCustomerId:'cus_qa_duplicate'})]);
    const duplicatePlan=await migration.plan(duplicateDb);
    await assert.rejects(migration.up(duplicateDb,duplicatePlan),/Migration 022 is impossible/);
    assert.deepEqual(await indexes(duplicateDb),[]);
    assert.equal(await duplicateDb.collection('Subscription').countDocuments(),2);
    checks.push('Pre-existing duplicate real string IDs fail before any index/data mutation');

    const malformed=database('malformed');
    await malformed.collection('Subscription').insertOne(row({stripeCustomerId:['cus_array_is_invalid']}));
    await assert.rejects(migration.up(malformed,await migration.plan(malformed)),/non-string, non-null value/);
    assert.deepEqual(await indexes(malformed),[]);
    checks.push('Unexpected array/non-string Stripe identifiers fail preflight without changes');

    const foreign=database('foreign_index');
    await foreign.collection('Subscription').createIndex({stripeCustomerId:1},{name:'foreign_customer_unique',unique:true});
    await assert.rejects(migration.plan(foreign),/Unowned Subscription index foreign_customer_unique/);
    const unexpected=database('unexpected_named_index');
    await unexpected.collection('Subscription').createIndex({stripeCustomerId:1,status:1},{name:'Subscription_stripeCustomerId_key',unique:true});
    await assert.rejects(migration.plan(unexpected),/Unexpected definition/);
    checks.push('Unowned equivalent and incorrectly named compound indexes are rejected instead of silently removed');

    const changed=database('changed_after_plan');await setup(changed);
    const changedPlan=await migration.plan(changed);
    await changed.collection('Subscription').dropIndex('Subscription_stripeCustomerId_key');
    await changed.collection('Subscription').createIndex({stripeCustomerId:1},{name:'Subscription_stripeCustomerId_key',unique:true,sparse:true});
    await assert.rejects(migration.up(changed,changedPlan),/changed after migration 022 planning/);
    assert.equal((await indexes(changed)).length,2);
    checks.push('Index-definition changes after planning cannot be mistaken for migration-owned state');

    const forged=database('forged_checkpoint');await setup(forged);
    const forgedPlan=await migration.plan(forged), forgedBefore=comparable(await indexes(forged));
    forgedPlan.entries[0].target.key={status:1};
    await assert.rejects(migration.up(forged,forgedPlan),/Unrecognised migration 022 index ownership in checkpoint/);
    await assert.rejects(migration.down(forged,forgedPlan),/Unrecognised migration 022 index ownership in checkpoint/);
    assert.equal(comparable(await indexes(forged)),forgedBefore);
    checks.push('Forged replacement keys cannot weaken real identifier uniqueness or change indexes');

    const collated=database('collation');
    for(const field of fields)await collated.collection('Subscription').createIndex({[field]:1},{name:`Subscription_${field}_key`,unique:true,collation:{locale:'en',strength:2}});
    const collatedBefore=await indexes(collated),collatedPlan=await migration.plan(collated);
    await collated.collection('Subscription').insertOne(row({stripeCustomerId:'cus_qa_CASE',stripeSubscriptionId:'sub_qa_CASE'}));
    await migration.up(collated,collatedPlan);
    await duplicate(()=>collated.collection('Subscription').insertOne(row({stripeCustomerId:'CUS_QA_CASE',stripeSubscriptionId:'sub_qa_other'})));
    await duplicate(()=>collated.collection('Subscription').insertOne(row({stripeCustomerId:'cus_qa_other',stripeSubscriptionId:'SUB_QA_CASE'})));
    await migration.down(collated,collatedPlan);
    assert.equal(comparable(await indexes(collated)),comparable(collatedBefore));
    checks.push('Explicit case-insensitive legacy collations are retained by replacements, duplicate preflight and exact rollback');

    const inherited=database('default_collation');
    await inherited.createCollection('Subscription',{collation:{locale:'en',strength:2}});
    const inheritedPlan=await migration.plan(inherited);
    await migration.up(inherited,inheritedPlan);await migration.up(inherited,inheritedPlan);
    await inherited.collection('Subscription').insertOne(row({stripeCustomerId:'cus_qa_DEFAULT'}));
    await duplicate(()=>inherited.collection('Subscription').insertOne(row({stripeCustomerId:'CUS_QA_DEFAULT'})));
    assert.equal((await migration.plan(inherited)).entries.length,0);
    await migration.down(inherited,inheritedPlan);
    assert.deepEqual(await indexes(inherited),[]);
    checks.push('Index-free collections inherit their default collation without checkpoint mismatches or lost uniqueness');

    const simpleOverride=database('simple_override');
    await simpleOverride.createCollection('Subscription',{collation:{locale:'en',strength:2}});
    for(const field of fields)await simpleOverride.collection('Subscription').createIndex({[field]:1},{name:`Subscription_${field}_key`,unique:true,collation:{locale:'simple'}});
    const simpleBefore=await indexes(simpleOverride),simplePlan=await migration.plan(simpleOverride);
    await simpleOverride.collection('Subscription').insertMany([row({stripeCustomerId:'cus_qa_simple',stripeSubscriptionId:'sub_qa_simple'}),row({stripeCustomerId:'CUS_QA_SIMPLE',stripeSubscriptionId:'SUB_QA_SIMPLE'})]);
    await migration.up(simpleOverride,simplePlan);await migration.down(simpleOverride,simplePlan);
    assert.equal(comparable(await indexes(simpleOverride)),comparable(simpleBefore));
    checks.push('Explicit simple index collation overrides survive replacement and rollback on a case-insensitive collection');

    const journal=database('journal');await setup(journal);
    await migrateData(journal,'up',migration.id);await migrateData(journal,'up',migration.id);
    const entry=await journal.collection('_fakturoMigrations').findOne({_id:migration.id});
    assert.equal(entry.status,'applied');assert.equal(entry.checkpoint.schemaVersion,1);
    await migrateData(journal,'down',migration.id);
    assert.equal(await journal.collection('_fakturoMigrations').countDocuments(),0);
    await migrateData(journal,'up',migration.id);
    assert.equal((await migration.plan(journal)).entries.length,0);
    checks.push('Real migration catalog and persisted checkpoint support up/up/down/up');

    const prismaDb=database('prisma_checkout');await setup(prismaDb);
    const prismaUri=new URL(databaseUrl);prismaUri.pathname='/'+prismaDb.databaseName;
    const prisma=new PrismaClient({datasources:{db:{url:prismaUri.toString()}}});
    try {
      const owners=await Promise.all(['one','two'].map(label=>prisma.user.create({data:{email:`checkout-${label}-${marker}@example.test`,password:'unusable-synthetic-fixture'}})));
      await migration.up(prismaDb,await migration.plan(prismaDb));
      for(const [index,owner] of owners.entries())await prisma.subscription.upsert({where:{userId:owner.id},create:{userId:owner.id,stripeCustomerId:`cus_qa_prisma_pending_${index}`,status:'inactive'},update:{stripeCustomerId:`cus_qa_prisma_pending_${index}`}});
      assert.equal(await prisma.subscription.count(),2);
      const pending=await prismaDb.collection('Subscription').find({}).toArray();
      assert.ok(pending.every(value=>!Object.hasOwn(value,'stripeSubscriptionId')));
      await assert.rejects(prisma.subscription.upsert({where:{userId:owners[1].id},create:{userId:owners[1].id,stripeCustomerId:'cus_qa_prisma_pending_0',status:'inactive'},update:{stripeCustomerId:'cus_qa_prisma_pending_0'}}),error=>error.code==='P2002');
      assert.equal((await prisma.subscription.findUnique({where:{userId:owners[1].id}})).stripeCustomerId,'cus_qa_prisma_pending_1');
    } finally { await prisma.$disconnect(); }
    checks.push('Actual Prisma checkout upserts create two pending customer-only subscriptions and reject a duplicate customer without changing the second account');
    console.log(`[integration] PASS ${checks.length} native Mongo nullable Stripe index regressions`);
    return {status:'passed',scope:'isolated-MongoMemoryReplSet-synthetic-native-records',checks};
  } finally {
    // All databases are fresh marker-scoped fixtures inside the harness's own
    // isolated replica set; inherited production database URLs are never used.
    for(const db of databases) await db.dropDatabase();
  }
}
