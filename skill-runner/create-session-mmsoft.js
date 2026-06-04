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

  // Ustaw wartości w polach bezpośrednio przez DOM
  await page.evaluate(([l, p]) => {
    document.querySelector('input[name="Adm"]').value = l;
    document.querySelector('input[name="Pas"]').value = p;
  }, [login, password]);

  console.log('Loguję się przez klik przycisku (zamieniaj() uruchomi się automatycznie)...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('input[type="submit"][value="Zaloguj"]')
  ]);

  const url = page.url();
  console.log('URL po logowaniu:', url);

  const loggedIn = await page.locator('a:has-text("Saldo")').count() > 0;
  if (!loggedIn) {
    console.error('Logowanie nie powiodło się — sprawdź MMSOFT_LOGIN i MMSOFT_PASSWORD.');
    await page.screenshot({ path: 'login-debug.png' });
    console.error('Screenshot zapisany: login-debug.png');
    await browser.close();
    process.exit(1);
  }

  const sessionPath = path.join(__dirname, '..', 'session-mmsoft.json');
  await context.storageState({ path: sessionPath });
  console.log('Sesja zapisana:', sessionPath);

  await browser.close();
})();
