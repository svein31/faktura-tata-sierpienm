/**
 * Skrypt testowej aktywacji i weryfikacji subskrypcji planu Pro.
 * 
 * Użycie:
 *   node scripts/test-subscription-payment.cjs [opcjonalny_email] [monthly|yearly]
 * 
 * Przykład:
 *   node scripts/test-subscription-payment.cjs wwwyczek@gmail.com monthly
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const targetEmail = process.argv[2] || 'wwwyczek@gmail.com';
const targetPlan = process.argv[3] || 'monthly';

async function main() {
  console.log('====================================================');
  console.log('   TESTOWA PŁATNOŚĆ I AKTYWACJA SUBSKRYPCJI PRO     ');
  console.log('====================================================\n');

  console.log(`1. Wyszukiwanie użytkownika: ${targetEmail}...`);
  const user = await prisma.user.findUnique({
    where: { email: targetEmail },
    include: { subscription: true },
  });

  if (!user) {
    console.error(`\x1b[31mBłąd: Nie znaleziono użytkownika o adresie ${targetEmail}\x1b[0m`);
    process.exit(1);
  }

  console.log(`   Znaleziono: ${user.name || user.email} (ID: ${user.id})`);
  console.log(`   Poprzedni stan subskrypcji:`, user.subscription ? `${user.subscription.plan} (${user.subscription.status})` : 'Brak (Konto Free)');

  console.log(`\n2. Symulacja pomyślnej płatności Stripe dla planu Pro (${targetPlan === 'yearly' ? 'Roczny 59 PLN' : 'Miesięczny 7 PLN'})...`);

  const fakeSubscriptionId = 'sub_test_' + Date.now();
  const fakeCustomerId = user.subscription?.stripeCustomerId || ('cus_test_' + Date.now());
  const stripePriceId = targetPlan === 'yearly'
    ? (process.env.STRIPE_PRICE_ID_YEARLY || 'price_1UIrCgCuNMNKgzvnMzY0Asfi')
    : (process.env.STRIPE_PRICE_ID_MONTHLY || 'price_1UIrCgCuNMNKgzvnKDUuxMaq');

  const daysValid = targetPlan === 'yearly' ? 365 : 30;
  const currentPeriodEnd = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000);

  // Zapis w bazie danych identyczny z syncStripeSubscription()
  const sub = await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      stripeCustomerId: fakeCustomerId,
      stripeSubscriptionId: fakeSubscriptionId,
      stripePriceId: stripePriceId,
      plan: targetPlan,
      status: 'active',
      currentPeriodEnd: currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
    update: {
      stripeCustomerId: fakeCustomerId,
      stripeSubscriptionId: fakeSubscriptionId,
      stripePriceId: stripePriceId,
      plan: targetPlan,
      status: 'active',
      currentPeriodEnd: currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  console.log('   \x1b[32m✔ Subskrypcja pomyślnie zsynchronizowana i zapisana w MongoDB Atlas!\x1b[0m');
  console.log('   Szczegóły rekordu:');
  console.log('   - Plan:', sub.plan);
  console.log('   - Status:', sub.status);
  console.log('   - Stripe Customer ID:', sub.stripeCustomerId);
  console.log('   - Stripe Subscription ID:', sub.stripeSubscriptionId);
  console.log('   - Ważna do:', sub.currentPeriodEnd.toISOString());

  console.log('\n3. Weryfikacja uprawnień i limitów w aplikacji...');
  const isActive = sub && (sub.status === 'active' || sub.status === 'trialing') && (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date());
  const quota = {
    tier: (isActive && (sub.plan === 'monthly' || sub.plan === 'yearly')) ? 'pro' : 'free',
    limit: (isActive && (sub.plan === 'monthly' || sub.plan === 'yearly')) ? null : 5,
  };

  console.log(`   - hasActivePro: \x1b[32m${isActive}\x1b[0m`);
  console.log(`   - Tier konta: \x1b[32m${quota.tier.toUpperCase()}\x1b[0m`);
  console.log(`   - Limit faktur: \x1b[32m${quota.limit === null ? 'BEZ LIMITU (Nielimitowany)' : quota.limit}\x1b[0m`);

  console.log('\n\x1b[32m====================================================');
  console.log('   TESTOWA PŁATNOŚĆ PLANU PRO ZAKOŃCZONA SUKCESEM!  ');
  console.log('====================================================\x1b[0m\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\x1b[31mBłąd wykonania:\x1b[0m', err);
    process.exit(1);
  });
