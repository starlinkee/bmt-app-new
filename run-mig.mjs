import { Client } from 'pg';
import fs from 'fs';

const connectionString = 'postgresql://postgres:Loskefiros!0@db.aimxvcnyzraoacrbdsbz.supabase.co:5432/postgres';

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/0033_tenant_readings.sql', 'utf8');
  await client.query(sql);
  console.log('Migration done!');
  await client.end();
}

run().catch(console.error);
