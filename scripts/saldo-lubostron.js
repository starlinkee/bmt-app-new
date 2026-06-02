const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Nawigacja
    await page.goto('https://mmsoft.com.pl/lokale.php?Adm=1', { waitUntil: 'networkidle' });
    console.log('Strona załadowana');

    // 2. Logowanie - kliknij przycisk Zaloguj (dane autouzupełnione)
    await page.click('input[type="submit"][value="Zaloguj"], button:has-text("Zaloguj"), input[type="submit"]');
    await page.waitForLoadState('networkidle');
    console.log('Zalogowano');

    // 3. Zamknij popup UWAGA jeśli istnieje
    try {
      const closeLink = page.locator('a:has-text("Close"), a[href*="close"], .close, #close');
      if (await closeLink.first().isVisible({ timeout: 3000 })) {
        await closeLink.first().click();
        console.log('Popup zamknięty');
      }
    } catch (e) {
      console.log('Brak popupu UWAGA');
    }

    // 4. Kliknij "Saldo" w górnym menu
    await page.click('a:has-text("Saldo")');
    await page.waitForLoadState('networkidle');
    console.log('Kliknięto Saldo');

    // 5. Kliknij "tabela" w lewym panelu
    await page.click('a:has-text("tabela")');
    await page.waitForLoadState('networkidle');
    console.log('Kliknięto tabela');

    // 8. Ustal datę i godzinę
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    console.log('Data/godzina:', dateStr);

    // 9. Utwórz folder docelowy
    const targetDir = path.join(
      'C:\\Users\\Jerzy\\Desktop\\saldo_mmsoft',
      'Lubostroń 15A_38 Zarządca Nieruchomości Adnier',
      dateStr
    );
    fs.mkdirSync(targetDir, { recursive: true });
    console.log('Folder utworzony:', targetDir);

    // 6. Zrzut ekranu fullPage
    const screenshotPath = path.join(targetDir, 'saldo_tabela.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Zrzut ekranu zapisany:', screenshotPath);

    // 7. Znajdź link "Zapisz do PDF" pod pierwszą tabelą
    const pdfPath = path.join(targetDir, 'saldo_tabela.pdf');

    const pdfUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const pdfLink = links.find(a =>
        a.textContent.trim().toLowerCase().includes('zapisz do pdf') ||
        a.href.toLowerCase().includes('pdf') ||
        a.textContent.trim().toLowerCase().includes('pdf')
      );
      return pdfLink ? pdfLink.href : null;
    });

    if (pdfUrl) {
      console.log('URL PDF:', pdfUrl);
      const pdfData = await page.evaluate(async (url) => {
        const resp = await fetch(url, { credentials: 'include' });
        const buffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      }, pdfUrl);

      fs.writeFileSync(pdfPath, Buffer.from(pdfData, 'base64'));
      console.log('PDF zapisany:', pdfPath);
    } else {
      console.log('UWAGA: Nie znaleziono linku "Zapisz do PDF"');
      // Snapshot strony dla debugowania
      const html = await page.content();
      fs.writeFileSync(path.join(targetDir, 'debug.html'), html);
    }

    console.log('\n=== SUKCES ===');
    console.log('Folder:', targetDir);
    console.log('PNG:', screenshotPath);
    if (pdfUrl) console.log('PDF:', pdfPath);

  } finally {
    await browser.close();
  }
})();
