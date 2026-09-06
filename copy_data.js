const { Client } = require('pg');

const oldUrl = 'postgresql://postgres:Loskefiros!0@db.aimxvcnyzraoacrbdsbz.supabase.co:5432/postgres';
const newUrl = 'postgresql://postgres.emjiqrfpvdiyodzezzlm:Loskefiros10@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

async function copyData() {
  const oldClient = new Client({ connectionString: oldUrl });
  const newClient = new Client({ connectionString: newUrl });

  try {
    await oldClient.connect();
    await newClient.connect();
    console.log('Connected to both databases.');

    // Helper to get non-generated columns
    async function getColumns(client, schema, table) {
      const res = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2 
        AND is_generated = 'NEVER' AND identity_generation IS NULL
      `, [schema, table]);
      return res.rows.map(r => r.column_name);
    }

    // 1. Copy auth.users
    console.log('Copying auth.users...');
    const userCols = await getColumns(newClient, 'auth', 'users');
    const users = await oldClient.query('SELECT * FROM auth.users');
    for (const user of users.rows) {
      const keys = userCols.filter(k => user[k] !== undefined);
      const values = keys.map(k => {
        const val = user[k];
        if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
          return JSON.stringify(val);
        }
        return val;
      });
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      try {
        await newClient.query(
          `INSERT INTO auth.users (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
          values
        );
      } catch (err) {
        console.error(`Error inserting user ${user.id}:`, err.message);
      }
    }

    // 2. Topological order for public tables
    const tables = [
      'app_config',
      'profiles',
      'properties',
      'tenants',
      'contracts',
      'invoices',
      'transactions',
      'settlement_groups',
      'settlement_group_properties',
      'transaction_staging',
      'transaction_amendments',
      'media_settlements',
      'media_meter_readings',
      'email_logs',
      'operation_log',
      'audit_log'
    ];

    for (const table of tables) {
      console.log(`Copying table ${table}...`);
      const cols = await getColumns(newClient, 'public', table);
      const res = await oldClient.query(`SELECT * FROM "public"."${table}"`);
      
      let inserted = 0;
      for (const row of res.rows) {
        const keys = cols.filter(k => row[k] !== undefined);
        const values = keys.map(k => {
          const val = row[k];
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            return JSON.stringify(val);
          }
          return val;
        });
        
        if (keys.length === 0) continue;

        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        try {
          await newClient.query(
            `INSERT INTO "public"."${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          inserted++;
        } catch (err) {
          console.error(`Error inserting into ${table}:`, err.message);
        }
      }
      console.log(`Copied ${inserted}/${res.rowCount} rows for ${table}.`);
    }

    console.log('Done!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await oldClient.end();
    await newClient.end();
  }
}

copyData();
