import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createServiceClient } from './lib/supabase/service';
async function main() {
  const supabase = createServiceClient();
  const { data, error } = await (supabase as any).from('skill_prompts').select('id, label, description, prompt');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
main();
