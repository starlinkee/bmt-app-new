const { chromium } = require('/home/apprunner/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const login = process.env.MMSOFT_LOGIN;
const password = process.env.MMSOFT_PASSWORD;

if (!login || !password) {
  console.error('Brak MMSOFT_LOGIN lub MMSOFT_PASSWORD w zmiennych środowiskowych.');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Przechodzę na stronę logowania...');
  await page.goto('https://mmsoft.com.pl/lokale.php?Adm=1', { waitUntil: 'networkidle' });

  // Pobierz Key z formularza (potrzebny do hashowania hasła)
  const key = await page.$eval('input[name="Key"]', el => el.value);
  console.log('Key z formularza:', key);

  // Oblicz hash po stronie Node.js: md5(md5(password + "MM") + Key)
  const crypto = require('crypto');
  const md5 = str => crypto.createHash('md5').update(str).digest('hex');
  const hashedPassword = md5(md5(password + 'MM') + key);

  console.log('Loguję się...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.evaluate(([login, hashed]) => {
      const f = document.forms['FmLog'];
      f.Adm.value = login;
      f.Pas.value = hashed;
      f.Jaklog.value = 1;
      f.submit();
    }, [login, hashedPassword])
  ]);

  const url = page.url();
  console.log('URL po logowaniu:', url);

  const isLoginPage = await page.evaluate(() => !!document.forms['FmLog']);
  if (isLoginPage) {
    console.error('Logowanie nie powiodło się — sprawdź MMSOFT_LOGIN i MMSOFT_PASSWORD.');
    await browser.close();
    process.exit(1);
  }

  const sessionPath = path.join(__dirname, '..', 'session-mmsoft.json');
  await context.storageState({ path: sessionPath });
  console.log('Sesja zapisana:', sessionPath);

  await browser.close();
})();
