const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('curl -H "x-token: ***REMOVED-SKILL-RUNNER-TOKEN***" http://localhost:3021/skills', (err, stream) => {
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
  host: '***REMOVED-VPS-IP***',
  port: 22,
  username: 'root',
  password: '***REMOVED-VPS-PASSWORD***',
  readyTimeout: 30000
});
