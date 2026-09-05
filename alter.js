/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
  });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE app_config 
      ADD COLUMN IF NOT EXISTS late_reminder_subject TEXT NOT NULL DEFAULT 'Rozliczenie wpłat i rachunków - BMT', 
      ADD COLUMN IF NOT EXISTS late_reminder_body TEXT NOT NULL DEFAULT 'Szanowny/a {imie},
      
Przesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.

Prosimy o uregulowanie należności.

Pozdrawiamy,
BMT';
    `);
    console.log('Success');
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
