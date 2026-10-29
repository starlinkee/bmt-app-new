import { test, expect } from './support/fixtures'
import { E2E_PREFIX } from './support/db'

// Wysyłka maili przez Gmail API z połączonego konta (slice 7c). Na deployu preview nie ma prawdziwego Google ani
// klucza szyfrującego, więc "wysyłka z połączeniem" działa na atrapie po stronie serwera: konto z adresem Google
// zaczynającym się od e2e_test__ (poza PRODUCTION) pomija Gmail API, a reszta (PDF, email_logs) jest prawdziwa.
// Testy dzielą jeden wiersz połączenia konta e2e, więc idą po kolei.
test.describe.configure({ mode: 'serial' })

const BLOCKED = 'Aby wysłać e-mail, połącz Gmaila w Ustawieniach.'

// Dłużnik z adresem e-mail: czynsz 1000 zł bez wpłat => saldo ujemne, w tabeli jest przycisk wysyłki wyciągu.
async function makeDebtor(
  { db, makeTenant }: Pick<Parameters<Parameters<typeof test>[2]>[0], 'db' | 'makeTenant'>,
) {
  const tenant = await makeTenant()
  const email = `${E2E_PREFIX.toLowerCase()}dluznik_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.invalid`
  const { error: tenantError } = await db.from('tenants').update({ email }).eq('id', tenant.tenantId)
  if (tenantError) throw tenantError
  const { data: row } = await db.from('tenants').select('owner_id').eq('id', tenant.tenantId).single()
  const { error } = await db.from('invoices').insert({
    owner_id: row!.owner_id,
    type: 'RENT',
    number: null,
    amount: 1000,
    month: 1,
    year: 2001,
    tenant_id: tenant.tenantId,
    source: 'MANUAL',
  })
  if (error) throw error
  return { ...tenant, email }
}

async function sendStatementFor(page: import('@playwright/test').Page, fullName: string) {
  await page.goto('/kontrola-platnosci')
  await page.getByPlaceholder('Szukaj...').fill(fullName)
  const row = page.getByRole('row').filter({ hasText: fullName })
  await expect(row).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await row.getByTitle('Wyślij podsumowanie do tego najemcy').click()
}

test('bez połączenia z Google: wysyłka wyciągu jest blokowana komunikatem i nic nie trafia do email_logs', async ({
  page,
  db,
  makeTenant,
  setGoogleConnection,
}) => {
  await setGoogleConnection({ status: 'disconnected' })
  const debtor = await makeDebtor({ db, makeTenant })

  await sendStatementFor(page, debtor.fullName)

  await expect(page.getByText(BLOCKED)).toBeVisible()
  const { data: logs } = await db.from('email_logs').select('id').eq('to_email', debtor.email)
  expect(logs).toHaveLength(0)
})

test('bez połączenia z Google: „wyślij do wszystkich zadłużonych” pokazuje komunikat blokady i nic nie wysyła', async ({
  page,
  db,
  makeTenant,
  setGoogleConnection,
}) => {
  await setGoogleConnection({ status: 'disconnected' })
  const debtor = await makeDebtor({ db, makeTenant })

  await page.goto('/kontrola-platnosci')
  const sendAll = page.getByRole('button', { name: /Wyślij do wszystkich zadłużonych/ })
  await expect(sendAll).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await sendAll.click()

  await expect(page.getByText(BLOCKED)).toBeVisible()
  await expect(page.getByText(/nie powiodło się/)).toHaveCount(0)
  const { data: logs } = await db.from('email_logs').select('id').eq('to_email', debtor.email)
  expect(logs).toHaveLength(0)
})

test('z połączonym kontem Google (atrapa): wyciąg wysłany, wpis w email_logs dla odbiorcy', async ({
  page,
  db,
  makeTenant,
  setGoogleConnection,
}) => {
  await setGoogleConnection({ status: 'connected', email: 'e2e_test__google@example.com', withSecret: true })
  const debtor = await makeDebtor({ db, makeTenant })

  await sendStatementFor(page, debtor.fullName)

  await expect(page.getByText('Wysłano pomyślnie!')).toBeVisible()
  await expect(page.getByText(BLOCKED)).toHaveCount(0)
  await expect
    .poll(async () => (await db.from('email_logs').select('id').eq('to_email', debtor.email)).data?.length)
    .toBe(1)
})
