import { test, expect } from './support/fixtures'
import { getTestOwnerId } from './support/db'

// Pliki Storage są per konto (slice 5): zalogowany właściciel pobiera plik spod swojego prefiksu
// <owner_id>/, a ścieżka z cudzym uuid daje 404. Plik zakłada klucz service (poza UI) i jest sprzątany.

const OTHER_OWNER = '00000000-0000-4000-8000-000000000000'

test('trasa PDF not mediów: własny plik 200 po redirect, cudzy prefiks 404', async ({ page, db }) => {
  const ownerId = await getTestOwnerId(db)
  if (!ownerId) throw new Error('Brak E2E_LOGIN_EMAIL - nie wiadomo, czyj prefiks założyć.')
  const rel = `E2E_TEST__pliki/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`
  const ownPath = `${ownerId}/${rel}`

  const { error } = await db.storage.from('invoices').upload(ownPath, Buffer.from('%PDF-1.4\n%E2E_TEST__\n'), { contentType: 'application/pdf' })
  if (error) throw new Error(`Nie udało się wgrać pliku testowego: ${error.message}`)

  try {
    const own = await page.request.get(`/api/media-settlement-pdf/${ownPath}`, { maxRedirects: 0 })
    expect(own.status()).toBe(307)
    const signed = await page.request.get(own.headers()['location'])
    expect(signed.status()).toBe(200)

    const foreign = await page.request.get(`/api/media-settlement-pdf/${OTHER_OWNER}/${rel}`, { maxRedirects: 0 })
    expect(foreign.status()).toBe(404)

    const legacy = await page.request.get(`/api/media-settlement-pdf/${rel}`, { maxRedirects: 0 })
    expect(legacy.status()).toBe(404)
  } finally {
    await db.storage.from('invoices').remove([ownPath])
  }
})
