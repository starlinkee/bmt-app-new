import { Client } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function run() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
  })
  await client.connect()
  try {
    await client.query(`ALTER TABLE email_logs ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;`)
    console.log('Success')
  } catch (e) {
    console.error(e)
  } finally {
    await client.end()
  }
}

run()
