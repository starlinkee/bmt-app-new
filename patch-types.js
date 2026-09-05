/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const file = 'types/supabase.ts';
let code = fs.readFileSync(file, 'utf8');

// 2. add tenant_reading_keys to settlement_groups
code = code.replace(
  /spreadsheet_id: string\r?\n\s*\}\r?\n\s*Insert:/g,
  'spreadsheet_id: string\n            tenant_reading_keys: Json\n          }\n          Insert:'
);
code = code.replace(
  /spreadsheet_id\?: string\r?\n\s*\}\r?\n\s*Update:/g,
  'spreadsheet_id?: string\n            tenant_reading_keys?: Json\n          }\n          Update:'
);
code = code.replace(
  /spreadsheet_id\?: string\r?\n\s*\}\r?\n\s*Relationships:/g,
  'spreadsheet_id?: string\n            tenant_reading_keys?: Json\n          }\n          Relationships:'
);

fs.writeFileSync(file, code, 'utf8');
console.log('Success tenant_reading_keys');
