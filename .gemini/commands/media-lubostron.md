Używając Playwright w trybie HEADLESS (przeglądarka niewidoczna, bez GUI, bez okna —     oszczędność zasobów):                                                                                                                                                             1. Przejdź na https://mmsoft.com.pl/lokale.php?Adm=1                                   
  2. Zaloguj się danymi które są już autouzupełnione w formularzu (kliknij przycisk      
  "Zaloguj").                                                                            
  3. Jeśli pojawi się popup/modal "UWAGA" — zamknij go klikając link "Close".            
  4. Kliknij "Saldo" w górnym menu nawigacyjnym.                                         
  5. Kliknij "tabela" w lewym panelu bocznym (lista SZCZEGÓŁOWOŚĆ).                      
  6. Zrób pełnostronicowy zrzut ekranu (fullPage: true).                                 
  7. Pod pierwszą tabelą od góry znajdź link/przycisk "Zapisz do PDF" i pobierz plik PDF 
     (użyj JavaScript fetch() z credentials: 'include' na URL tego linku, zdekoduj       
  base64 i                                                                               
     zapisz jako plik binarny).                                                          
  8. Ustal aktualną datę i godzinę w formacie RRRR-MM-DD_HH-MM (np. 2026-06-01_21-52).   
  9. Odczytaj zmienną środowiskową OUTPUT_BASE_DIR. Jeśli nie jest ustawiona, użyj jako  
  fallback                                                                               
     ścieżki względnej claude_code_results w bieżącym katalogu roboczym (czyli tam gdzie 
  działa                                                                                 
     proces — na Windows i Linux da to poprawny wynik bo Claude jest uruchamiany z       
  WORK_DIR).                                                                             
  10. Zapisz zrzut ekranu jako saldo_tabela.png i PDF jako saldo_tabela.pdf w folderze:  
      <OUTPUT_BASE_DIR>/Lubostron 15A/<data_godzina>/                                    
      (utwórz cały folder jeśli nie istnieje, używając mkdir -p lub odpowiednika).


  const { chromium } =
  require('/home/apprunner/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
  const fs = require('fs');
  const path = require('path');

  (async () => {
    const login = process.env.MMSOFT_LOGIN;
    const password = process.env.MMSOFT_PASSWORD;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://mmsoft.com.pl/lokale.php?Adm=1', { waitUntil:
  'networkidle' });

      await page.evaluate(([l, p]) => {
        document.querySelector('input[name="Adm"]').value = l;
        document.querySelector('input[name="Pas"]').value = p;
      }, [login, password]);

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('input[type="submit"][value="Zaloguj"]')
      ]);

      const isLoginPage = await page.evaluate(() => !!document.forms['FmLog']);
      if (isLoginPage) throw new Error('Logowanie nie powiodło się');

      try {
        await page.locator('.fancybox-overlay').waitFor({ timeout: 3000 });
        const closeBtn = page.locator('a:has-text("Close"), .fancybox-close');
        if (await closeBtn.count() > 0) {
          await closeBtn.first().click();
        } else {
          await page.keyboard.press('Escape');
        }
        await page.waitForSelector('.fancybox-overlay', { state: 'hidden', timeout: 5000
  });
      } catch {}

      await page.locator('a:has-text("Saldo")').first().click();
      await page.waitForLoadState('networkidle');

      await page.locator('a:has-text("tabela")').first().click();
      await page.waitForLoadState('networkidle');

      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())  }_${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const base = process.env.OUTPUT_BASE_DIR || path.join(process.cwd(),
  'claude_code_results');
      const outDir = path.join(base, 'Lubostron 15A', dateStr);
      fs.mkdirSync(outDir, { recursive: true });

      await page.screenshot({ path: path.join(outDir, 'saldo_tabela.png'), fullPage: true  });
      console.log('PNG:', path.join(outDir, 'saldo_tabela.png'));

      const pdfUrl = await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a')).find(a =>
          a.textContent.toLowerCase().includes('pdf') ||
  a.href.toLowerCase().includes('pdf')
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

      fs.writeFileSync(path.join(outDir, 'saldo_tabela.pdf'), Buffer.from(pdfData,
  'base64'));
      console.log('PDF:', path.join(outDir, 'saldo_tabela.pdf'));

    } finally {
      await browser.close();
    }
  })();