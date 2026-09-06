const { Client } = require('ssh2');

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
  host: '89.167.122.243',
  port: 22,
  username: 'root',
  password: 'Loskefiros!0'
});
