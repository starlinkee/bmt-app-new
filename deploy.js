const { Client } = require('ssh2');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const token = crypto.randomBytes(32).toString('hex');
console.log('--- GENEROWANY TOKEN: ' + token + ' ---');

// The files we want to upload (server.js, Dockerfile, package.json, prompts.json)
const skillDir = path.join(__dirname, 'skill-runner');
const filesToUpload = ['server.js', 'Dockerfile', 'package.json', 'prompts.json', 'railway.json'];

conn.on('ready', () => {
  console.log('Client :: ready');
  conn.sftp((err, sftp) => {
    if (err) throw err;

    const remoteDir = '/opt/bmt-skill-runner';

    // Utwórz katalog jeśli nie istnieje
    conn.exec(`mkdir -p ${remoteDir} && rm -rf ${remoteDir}/*`, (err, stream) => {
      if (err) throw err;
      stream.on('close', (code, signal) => {
        console.log('Remote directory created/cleaned.');
        uploadFiles(sftp, remoteDir, () => {
          // Po wgraniu plików wykonujemy komendy na serwerze
          executeCommands();
        });
      }).resume();
    });
  });
}).connect({
  host: '89.167.122.243',
  port: 22,
  username: 'root',
  password: 'Loskefiros!0',
  readyTimeout: 30000
});

function uploadFiles(sftp, remoteDir, callback) {
  let uploads = filesToUpload.length;
  filesToUpload.forEach(file => {
    const localPath = path.join(skillDir, file);
    if (!fs.existsSync(localPath)) {
      console.log(`Skipping ${file} as it doesn't exist locally.`);
      uploads--;
      if (uploads === 0) callback();
      return;
    }
    const remotePath = `${remoteDir}/${file}`;
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) throw err;
      console.log(`Uploaded ${file}`);
      uploads--;
      if (uploads === 0) callback();
    });
  });
}

function executeCommands() {
  const commands = [
    // Ensure docker is installed (apt-get update && apt-get install docker.io -y)
    // Actually, root probably has docker, but let's check
    `command -v docker || (apt-get update && apt-get install -y docker.io)`,
    `cd /opt/bmt-skill-runner`,
    `echo "Budowanie obrazu Dockera (to potrwa chwilę)..."`,
    `docker build -t bmt-skill-runner .`,
    `echo "Zatrzymywanie starych usług (systemd)..."`,
    `systemctl stop bmt-skill-runner || true`,
    `systemctl disable bmt-skill-runner || true`,
    `kill -9 $(lsof -t -i:3021) || true`,
    `echo "Zatrzymywanie starego kontenera..."`,
    `docker rm -f bmt-skill-runner || true`,
    `echo "Uruchamianie nowego kontenera z bezpiecznym tokenem..."`,
    `docker run -d --name bmt-skill-runner -p 3021:3021 --restart unless-stopped -e SKILL_RUNNER_TOKEN=${token} bmt-skill-runner`,
    `echo "Gotowe!"`
  ].join(' && ');

  console.log('Executing deployment commands on VPS...');
  conn.exec(commands, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Deployment commands executed. Exit code:', code);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}
