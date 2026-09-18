const { Client } = require('ssh2');
const fs = require('fs');
const { VPS_HOST, VPS_PORT, VPS_USERNAME, VPS_PASSWORD, assertPresent } = require('./scripts/load-deploy-env');
assertPresent({ VPS_HOST, VPS_PASSWORD }, ['VPS_HOST', 'VPS_PASSWORD']);

const env = fs.readFileSync('.env.production', 'utf8');
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL="(.+)"/)[1];
const supabaseKey = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.+)"/)[1];

const conn = new Client();
conn.on('ready', () => {
  const script = 'cd /opt/bmt-app/skill-runner && git config --global --add safe.directory /opt/bmt-app && cd /opt/bmt-app && git fetch origin dev && git checkout -B dev origin/dev && git pull origin dev && cd /opt/bmt-app/skill-runner && npm install && echo NEXT_PUBLIC_SUPABASE_URL=' + supabaseUrl + ' > secrets.env && echo SUPABASE_SERVICE_ROLE_KEY=' + supabaseKey + ' >> secrets.env && echo WORK_DIR=/opt/bmt-app >> secrets.env && systemctl daemon-reload && systemctl restart bmt-skill-runner && systemctl status bmt-skill-runner --no-pager';
  conn.exec(script, (err, stream) => {
    stream.on('close', () => conn.end()).on('data', d => console.log('OUT: ' + d)).stderr.on('data', d => console.log('ERR: ' + d));
  });
}).connect({
  host: VPS_HOST,
  port: VPS_PORT,
  username: VPS_USERNAME,
  password: VPS_PASSWORD
});
