const { Client } = require('pg');

const oldUrl = 'postgresql://postgres:Loskefiros!0@db.aimxvcnyzraoacrbdsbz.supabase.co:5432/postgres';
const newUrl = 'postgresql://postgres.emjiqrfpvdiyodzezzlm:Loskefiros10@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

async function run() {
  const oldClient = new Client({ connectionString: oldUrl });
  const newClient = new Client({ connectionString: newUrl });

  try {
    await oldClient.connect();
    await newClient.connect();

    console.log('Truncating tables in new DB...');
    await newClient.query(`
      TRUNCATE 
        public.properties, 
        public.tenants, 
        public.contracts, 
        public.invoices, 
        public.transactions, 
        public.settlement_groups,
        public.email_logs,
        public.operation_log,
        public.audit_log
      CASCADE
    `);

    async function copyTable(table) {
      console.log(`Copying ${table}...`);
      
      // Get all columns except ALWAYS generated (but keep identity)
      const colRes = await newClient.query(`
        SELECT column_name, identity_generation 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        AND is_generated = 'NEVER'
      `, [table]);
      
      const cols = colRes.rows.map(r => r.column_name);
      const hasIdentity = colRes.rows.some(r => r.identity_generation !== null);
      
      const oldData = await oldClient.query(`SELECT * FROM "public"."${table}"`);
      
      let inserted = 0;
      for (const row of oldData.rows) {
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
        const override = hasIdentity ? 'OVERRIDING SYSTEM VALUE' : '';
        
        try {
          await newClient.query(
            `INSERT INTO "public"."${table}" (${keys.map(k => `"${k}"`).join(', ')}) ${override} VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          inserted++;
        } catch (err) {
          console.error(`Error inserting into ${table}:`, err.message);
        }
      }
      console.log(`Copied ${inserted}/${oldData.rowCount} rows for ${table}.`);
      
      // Reset sequence for identity column if exists
      if (hasIdentity) {
        try {
           const idCol = colRes.rows.find(r => r.identity_generation !== null).column_name;
           await newClient.query(`SELECT setval(pg_get_serial_sequence('"public"."${table}"', '${idCol}'), COALESCE((SELECT MAX("${idCol}") FROM "public"."${table}") + 1, 1), false)`);
        } catch (e) {
           console.error(`Error resetting sequence for ${table}:`, e.message);
        }
      }
    }

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
      await copyTable(table);
    }
    console.log('Migration complete.');
  } catch (err) {
    console.error(err);
  } finally {
    await oldClient.end();
    await newClient.end();
  }
}
run();
