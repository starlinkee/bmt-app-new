/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const https = require('https');
const path = require('path');

const fontsDir = path.join(__dirname, 'public', 'fonts');
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

function downloadFont(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path.join(fontsDir, filename));
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(path.join(fontsDir, filename), () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading fonts...');
  await downloadFont('https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf', 'Roboto-Regular.ttf');
  await downloadFont('https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Bold.ttf', 'Roboto-Bold.ttf');
  console.log('Fonts downloaded.');
}
main();
