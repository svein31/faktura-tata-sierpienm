#!/usr/bin/env node
/**
 * Skrypt pomocniczy do automatycznego tworzenia produktów i planów cenowych w Stripe.
 *
 * Użycie:
 *   node scripts/setup-stripe-products.mjs [opcjonalny_stripe_secret_key]
 *
 * Domyślnie pobiera klucz ze zmiennej STRIPE_SECRET_KEY w środowisku lub .env.
 */

import Stripe from 'stripe';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Załaduj zmienne z .env jeśli istnieje
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').replace(/^["']|["']$/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
}

const secretKey = process.argv[2] || process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error('\x1b[31m%s\x1b[0m', 'Błąd: Brak klucza STRIPE_SECRET_KEY.');
  console.log('Podaj klucz jako argument lub ustaw go w zmiennej środowiskowej:');
  console.log('  node scripts/setup-stripe-products.mjs sk_test_... (lub rk_live_...)');
  process.exit(1);
}

const isLive = secretKey.startsWith('rk_live_') || secretKey.startsWith('sk_live_');
console.log(`Inicjalizacja Stripe w trybie: \x1b[33m${isLive ? 'PRODUKCYJNYM (LIVE)' : 'TESTOWYM (TEST)'}\x1b[0m\n`);

const stripe = new Stripe(secretKey);

async function main() {
  console.log('1. Tworzenie / weryfikacja produktu "FakturaProsto Pro"...');
  
  // Szukamy istniejącego produktu o tej nazwie
  const existingProducts = await stripe.products.list({ limit: 10 });
  let product = existingProducts.data.find(p => p.name === 'FakturaProsto Pro' || p.name === 'FakturaProsto');

  if (!product) {
    product = await stripe.products.create({
      name: 'FakturaProsto Pro',
      description: 'Dostęp do pełnej funkcjonalności aplikacji FakturaProsto.pl (faktury VAT, KSeF 2.0, magazyn, raporty)',
    });
    console.log(`   Utworzono produkt: ${product.name} (ID: ${product.id})`);
  } else {
    console.log(`   Znaleziono istniejący produkt: ${product.name} (ID: ${product.id})`);
  }

  console.log('\n2. Tworzenie cen subskrypcyjnych w walucie PLN...');

  // 1. Plan miesięczny: 7.00 PLN / miesiąc
  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 700, // 7.00 PLN w groszach
    currency: 'pln',
    recurring: {
      interval: 'month',
    },
    metadata: {
      plan: 'monthly',
      app: 'fakturaprosto',
    },
  });
  console.log(`   Utworzono cenę miesięczną (7 zł/msc): ${monthlyPrice.id}`);

  // 2. Plan roczny: 59.00 PLN / rok
  const yearlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 5900, // 59.00 PLN w groszach
    currency: 'pln',
    recurring: {
      interval: 'year',
    },
    metadata: {
      plan: 'yearly',
      app: 'fakturaprosto',
    },
  });
  console.log(`   Utworzono cenę roczną (59 zł/rok): ${yearlyPrice.id}`);

  console.log('\n\x1b[32m%s\x1b[0m', '=== SUKCES! Skopiuj poniższe zmienne do pliku .env ===\n');
  console.log(`STRIPE_PRICE_ID_MONTHLY="${monthlyPrice.id}"`);
  console.log(`STRIPE_PRICE_ID_YEARLY="${yearlyPrice.id}"`);
  console.log('\n======================================================');
}

main().catch(err => {
  console.error('\x1b[31m%s\x1b[0m', `Wystąpił błąd: ${err.message}`);
  process.exit(1);
});
