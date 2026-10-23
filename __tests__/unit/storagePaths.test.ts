import { describe, test, expect } from 'vitest'
import { emailAttachmentPath, isOwnedPath, ownerPath } from '@/lib/storage-paths'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('lib/storage-paths', () => {
  test('ownerPath dokleja prefiks konta', () => {
    expect(ownerPath(A, 'PREVIEW/2026/1/g/plik.pdf')).toBe(`${A}/PREVIEW/2026/1/g/plik.pdf`)
    expect(ownerPath(A, '/x.pdf')).toBe(`${A}/x.pdf`)
  })

  test('isOwnedPath: własny prefiks tak; cudzy, brak prefiksu, .., puste segmenty nie', () => {
    expect(isOwnedPath(A, `${A}/PREVIEW/2026/1/g/plik.pdf`)).toBe(true)
    expect(isOwnedPath(A, `${B}/PREVIEW/plik.pdf`)).toBe(false)
    expect(isOwnedPath(A, 'PREVIEW/2026/plik.pdf')).toBe(false)
    expect(isOwnedPath(A, `${A}/../${B}/plik.pdf`)).toBe(false)
    expect(isOwnedPath(A, `${A}//plik.pdf`)).toBe(false)
    expect(isOwnedPath(A, `${A}/`)).toBe(false)
    expect(isOwnedPath(A, A)).toBe(false)
    expect(isOwnedPath('', '/plik.pdf')).toBe(false)
    // prefiks będący początkiem cudzego id nie przechodzi
    expect(isOwnedPath(A, `${A}x/plik.pdf`)).toBe(false)
  })

  test('emailAttachmentPath: ten sam helper dla zapisu i odczytu, preview z osobnym katalogiem', () => {
    expect(emailAttachmentPath(A, 'u_f.pdf', false)).toBe(`${A}/emails/u_f.pdf`)
    expect(emailAttachmentPath(A, 'u_f.pdf', true)).toBe(`${A}/preview/emails/u_f.pdf`)
  })
})
