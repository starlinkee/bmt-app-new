import { test, expect } from './support/fixtures'

// Połączenie z Google (slice 7b). Na deployu preview nie ma prawdziwego Google, więc stan "po callbacku" ustawia
// fixture wprost w bazie; sam callback sprawdzamy na odmowach (zły state), a start łączenia na przekierowaniu.
// Testy dzielą jeden wiersz konta e2e, więc idą po kolei.
test.describe.configure({ mode: 'serial' })

test('brak połączenia: "Niepołączono" i przycisk łączenia', async ({ page, setGoogleConnection }) => {
  await setGoogleConnection({ status: 'disconnected' })
  await page.goto('/ustawienia')

  await expect(page.getByTestId('google-status')).toHaveText('Niepołączono')
  await expect(page.getByRole('link', { name: 'Połącz z Google' })).toHaveAttribute('href', '/api/google/connect')
  await expect(page.getByTestId('google-reauth-banner')).toHaveCount(0)
})

test('połączone konto: "Połączono jako …", odłączenie kasuje sekret nawet z fikcyjnym tokenem', async ({
  page,
  setGoogleConnection,
  getGoogleRows,
}) => {
  await setGoogleConnection({ status: 'connected', email: 'e2e_test__google@example.com', withSecret: true })
  await page.goto('/ustawienia')

  await expect(page.getByTestId('google-status')).toContainText('Połączono jako e2e_test__google@example.com')
  expect((await getGoogleRows()).credentials).toBe(1)

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Odłącz' }).click()

  await expect(page.getByText('Konto Google odłączone.')).toBeVisible()
  await expect(page.getByTestId('google-status')).toHaveText('Niepołączono')
  // Revoke fikcyjnego tokenu w Google się nie uda (albo nie ma klucza) - ma nie blokować kasowania sekretu.
  expect((await getGoogleRows()).credentials).toBe(0)
})

test('needs_reauth: baner na dashboardzie i status "Wymaga ponownego połączenia"', async ({ page, setGoogleConnection }) => {
  await setGoogleConnection({ status: 'needs_reauth', withSecret: true })

  await page.goto('/umowy')
  const banner = page.getByTestId('google-reauth-banner')
  await expect(banner).toBeVisible()
  await banner.getByRole('link', { name: 'Połącz ponownie w Ustawieniach' }).click()

  await expect(page).toHaveURL(/\/ustawienia/)
  await expect(page.getByTestId('google-status')).toContainText('Wymaga ponownego połączenia')
  await expect(page.getByRole('link', { name: 'Połącz ponownie', exact: true })).toBeVisible()
})

test('błąd: callback z nieprawidłowym state odmawia, nic nie zapisuje i nie ujawnia kodu', async ({
  page,
  request,
  setGoogleConnection,
  getGoogleRows,
}) => {
  await setGoogleConnection({ status: 'disconnected' })
  const before = await getGoogleRows()
  const code = '4/TAJNY-KOD-E2E'

  const res = await request.get(`/api/google/callback?state=zly-state&code=${encodeURIComponent(code)}`, { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  const location = res.headers()['location'] ?? ''
  expect(location).toContain('/ustawienia?google=state_invalid')
  expect(location + (await res.text())).not.toContain(code)

  await page.goto('/ustawienia?google=state_invalid')
  await expect(page.getByTestId('google-message')).toContainText('Nie udało się potwierdzić żądania łączenia')

  const after = await getGoogleRows()
  expect(after.credentials).toBe(0)
  expect(after.connections).toBe(before.connections)
})

test('start łączenia: przekierowanie na Google (gdy skonfigurowane) albo config_missing', async ({ page, request, setGoogleConnection }) => {
  await setGoogleConnection({ status: 'disconnected' })

  const res = await request.get('/api/google/connect', { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  const location = res.headers()['location'] ?? ''
  const configured = location.startsWith('https://accounts.google.com/')
  test.info().annotations.push({ type: 'wariant', description: configured ? 'GOOGLE_CONNECT_* ustawione na preview' : 'GOOGLE_CONNECT_* brak na preview (config_missing)' })

  if (configured) {
    const params = new URL(location).searchParams
    expect(params.get('access_type')).toBe('offline')
    expect(params.get('prompt')).toBe('consent')
    expect(params.get('scope')).toContain('https://www.googleapis.com/auth/gmail.send')
    const cookie = res.headers()['set-cookie'] ?? ''
    expect(cookie).toContain('google_oauth_state=')
    expect(cookie).toMatch(/HttpOnly/i)
  } else {
    expect(location).toContain('/ustawienia?google=config_missing')
    await page.goto('/ustawienia?google=config_missing')
    await expect(page.getByTestId('google-message')).toContainText('nie jest jeszcze skonfigurowane')
  }
})
