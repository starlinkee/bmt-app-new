// Statusy transakcji, które NIE są realnym wpływem od najemcy i muszą być
// wykluczane ze wszystkich sum finansowych (salda, wyciągi, przepływy,
// kontrola płatności). Historycznie kod filtrował tylko `.neq('status',
// 'DISMISSED')`, ale ten status nigdy nie jest faktycznie zapisywany w bazie
// — realne "odrzucone"/pominięte transakcje dostają status
// REJECTED_OWN_TRANSFER, REJECTED_OTHER albo SKIPPED (patrz
// app/(dashboard)/import/actions.ts). Przez to filtr był no-opem i takie
// transakcje (zawsze z tenant_id = null) zawyżały globalne "Łączne
// przychody", mimo że nie były przypisane do żadnego najemcy.
export const NON_INCOME_TRANSACTION_STATUSES = [
  'DISMISSED',
  'REJECTED_OWN_TRANSFER',
  'REJECTED_OTHER',
  'SKIPPED',
] as const

// Format oczekiwany przez PostgREST dla operatora `not(...,in,(...))`.
export const NON_INCOME_TRANSACTION_STATUSES_FILTER = `(${NON_INCOME_TRANSACTION_STATUSES.join(',')})`
