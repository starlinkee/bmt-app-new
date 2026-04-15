/**
 * Dopasowuje rachunek bankowy transakcji do najemcy.
 * Normalizuje konto (usuwa spacje, myślniki, prefix "PL").
 */
function normalizeAccount(account: string): string {
  return account
    .toUpperCase()
    .replace(/^PL/i, '')
    .replace(/[\s\-]/g, '')
}

interface TenantWithAccounts {
  id: number
  bank_accounts_as_text: string
}

export function matchTransaction(
  bankAccount: string | undefined | null,
  tenants: TenantWithAccounts[],
): TenantWithAccounts | null {
  if (!bankAccount) return null

  const normalized = normalizeAccount(bankAccount)
  if (!normalized) return null

  for (const tenant of tenants) {
    const accounts = tenant.bank_accounts_as_text
      .split(/[\n,;]+/)
      .map((a) => normalizeAccount(a.trim()))
      .filter(Boolean)

    for (const account of accounts) {
      // Dopasowanie dokładne lub suffix
      if (account === normalized || normalized.endsWith(account) || account.endsWith(normalized)) {
        return tenant
      }
    }
  }

  return null
}
