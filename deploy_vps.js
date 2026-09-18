const { Client } = require('ssh2');
const { VPS_HOST, VPS_PORT, VPS_USERNAME, VPS_PASSWORD, assertPresent } = require('./scripts/load-deploy-env');
assertPresent({ VPS_HOST, VPS_PASSWORD }, ['VPS_HOST', 'VPS_PASSWORD']);

const conn = new Client();
conn.on('ready', () => {
  conn.exec('find / -type d -name "skill-runner" 2>/dev/null', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: VPS_HOST,
  port: VPS_PORT,
  username: VPS_USERNAME,
  password: VPS_PASSWORD
});
