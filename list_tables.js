const { Client } = require('pg');

async function listTables() {
  const client = new Client({ connectionString: process.env.DB_URL });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    console.log(res.rows.map(r => r.table_name).join(', '));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
listTables();
