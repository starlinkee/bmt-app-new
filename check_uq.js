const { Client } = require('pg');

async function getUq() {
  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();
  const res = await client.query(`
    SELECT tc.constraint_name, tc.table_name, kcu.column_name 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu 
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema 
    WHERE tc.constraint_type = 'UNIQUE' AND tc.table_name = 'tenants'
  `);
  console.table(res.rows);
  await client.end();
}
getUq();
