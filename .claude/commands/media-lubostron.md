Używając Playwright w trybie HEADLESS (przeglądarka niewidoczna, bez GUI, bez okna —
oszczędność zasobów):

## Środowisko

Playwright jest dostępny jako moduł **Node.js** (NIE Python).
Wymagaj go przez: `require('/home/apprunner/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')`
Uruchamiaj skrypty przez: `node nazwa_skryptu.js`
Zmienne środowiskowe ładuj przez: `source skill-runner/secrets.env && node nazwa_skryptu.js`

Dane logowania:
- login: `process.env.MMSOFT_LOGIN`
- hasło: `process.env.MMSOFT_PASSWORD`

## Gotowy skrypt — użyj DOKŁADNIE tego kodu, bez żadnych zmian

Zapisz poniższy kod do pliku `.js` i uruchom. **NIE modyfikuj logiki logowania, obsługi popupu
ani sposobu pobierania PDF.** Ten kod jest przetestowany i działa — każda zmiana może go zepsuć.

```javascript
const { chromium } = require('/home/apprunner/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const login = process.env.MMSOFT_LOGIN;
  const password = process.env.MMSOFT_PASSWORD;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Logowanie
    await page.goto('https://mmsoft.com.pl/lokale.php?Adm=1', { waitUntil: 'networkidle' });

    await page.evaluate(([l, p]) => {
      document.querySelector('input[name="Adm"]').value = l;
      document.querySelector('input[name="Pas"]').value = p;
    }, [login, password]);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('input[type="submit"][value="Zaloguj"]')
      // klik przycisku wyzwala onclick=zamieniaj() który hashuje hasło MD5, potem formularz się submituje
    ]);

    const isLoginPage = await page.evaluate(() => !!document.forms['FmLog']);
    if (isLoginPage) throw new Error('Logowanie nie powiodło się');

    // 2. Zamknij popup UWAGA (fancybox overlay)
    try {
      await page.locator('.fancybox-overlay').waitFor({ timeout: 3000 });
      const closeBtn = page.locator('a:has-text("Close"), .fancybox-close');
      if (await closeBtn.count() > 0) {
        await closeBtn.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForSelector('.fancybox-overlay', { state: 'hidden', timeout: 5000 });
    } catch {}

    // 3. Nawigacja do Saldo > tabela
    await page.locator('a:has-text("Saldo")').first().click();
    await page.waitForLoadState('networkidle');

    await page.locator('a:has-text("tabela")').first().click();
    await page.waitForLoadState('networkidle');

    // 4. Folder docelowy
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const base = process.env.OUTPUT_BASE_DIR || path.join(process.cwd(), 'claude_code_results');
    const outDir = path.join(base, 'Lubostron 15A', dateStr);
    fs.mkdirSync(outDir, { recursive: true });

    // 5. Screenshot
    await page.screenshot({ path: path.join(outDir, 'saldo_tabela.png'), fullPage: true });
    console.log('PNG zapisany:', path.join(outDir, 'saldo_tabela.png'));

    // 6. Pobierz PDF
    const pdfUrl = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find(a =>
        a.textContent.toLowerCase().includes('pdf') || a.href.toLowerCase().includes('pdf')
      );
      return a ? a.href : null;
    });

    if (!pdfUrl) throw new Error('Nie znaleziono linku do PDF');

    const pdfData = await page.evaluate(async url => {
      const r = await fetch(url, { credentials: 'include' });
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let b = '';
      for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
      return btoa(b);
    }, pdfUrl);

    fs.writeFileSync(path.join(outDir, 'saldo_tabela.pdf'), Buffer.from(pdfData, 'base64'));
    console.log('PDF zapisany:', path.join(outDir, 'saldo_tabela.pdf'));

  } finally {
    await browser.close();
  }
})();
```

## Kluczowe zasady (nie zmieniaj bez powodu)

- **Logowanie**: ustaw wartości przez `page.evaluate` (DOM), potem kliknij przycisk — NIE wywołuj `zamieniaj()` ręcznie i NIE używaj `f.submit()`. Klik przycisku sam wyzwala `zamieniaj()` przez `onclick`.
- **Popup**: sprawdzaj po klasie `.fancybox-overlay`, nie po tekście.
- **OUTPUT_BASE_DIR**: jeśli nieustawiona, fallback to `claude_code_results` w CWD.
