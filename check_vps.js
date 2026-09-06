const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('curl -H "x-token: c08cda6f01545a7d69a5966b4f24e4801e844a9077134b8922c73f0bdc228d5a" http://localhost:3021/skills', (err, stream) => {
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
  host: '89.167.122.243',
  port: 22,
  username: 'root',
  password: 'Loskefiros!0',
  readyTimeout: 30000
});
