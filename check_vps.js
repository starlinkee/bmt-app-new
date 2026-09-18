const { Client } = require('ssh2');
const { VPS_HOST, VPS_PORT, VPS_USERNAME, VPS_PASSWORD, SKILL_RUNNER_TOKEN, assertPresent } = require('./scripts/load-deploy-env');
assertPresent({ VPS_HOST, VPS_PASSWORD, SKILL_RUNNER_TOKEN }, ['VPS_HOST', 'VPS_PASSWORD', 'SKILL_RUNNER_TOKEN']);

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`curl -H "x-token: ${SKILL_RUNNER_TOKEN}" http://localhost:3021/skills`, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: VPS_HOST,
  port: VPS_PORT,
  username: VPS_USERNAME,
  password: VPS_PASSWORD,
  readyTimeout: 30000
});
