// Statusy transakcji, które SĄ realnym wpływem od najemcy (potwierdzonym
// dopasowaniem podczas importu lub dodanym ręcznie). Wszystko inne — w tym
// każdy przyszły status odrzucenia/pominięcia dodany przy imporcie (patrz
// app/(dashboard)/import/actions.ts) — jest domyślnie wykluczane ze wszystkich
// sum finansowych (salda, wyciągi, przepływy, kontrola płatności), bez
// potrzeby dopisywania go tutaj. Wcześniej lista działała odwrotnie
// (blacklista statusów do wykluczenia) i nowy status `REJECTED_DUPLICATE`
// umknął tej liście, zawyżając globalne "Łączne przychody" transakcjami bez
// przypisanego najemcy.
export const INCOME_TRANSACTION_STATUSES = [
  'MATCHED',
  'MANUAL',
] as const

// Etykiety i warianty odznak dla statusów transakcji, współdzielone między
// widokami historii przelewów (`/import/history`) i historii importów
// (`/historia-importow`). `PENDING` to status wyłącznie prezentacyjny —
// wiersz nadal siedzi w `transaction_staging` i czeka na zatwierdzenie.
export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  MATCHED: 'Dopasowana',
  MANUAL: 'Ręczna',
  REJECTED_OWN_TRANSFER: 'Przelew własny',
  REJECTED_DUPLICATE: 'Duplikat',
  REJECTED_OTHER: 'Odrzucona',
  UNMATCHED: 'Nieznana',
  SKIPPED: 'Pominięta',
  PENDING: 'Do zatwierdzenia',
}

export const TRANSACTION_STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  MATCHED: 'default',
  MANUAL: 'outline',
  REJECTED_OWN_TRANSFER: 'secondary',
  REJECTED_DUPLICATE: 'secondary',
  REJECTED_OTHER: 'destructive',
  UNMATCHED: 'destructive',
  SKIPPED: 'secondary',
  PENDING: 'outline',
}
