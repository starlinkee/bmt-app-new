import Link from 'next/link'

export function GoogleReauthBanner() {
  return (
    <div role="alert" data-testid="google-reauth-banner" className="border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      Połączenie z Google wygasło lub zostało cofnięte. Wysyłka e-maili z Twojego konta nie działa, dopóki nie połączysz go ponownie.{' '}
      <Link href="/ustawienia" className="font-medium underline">
        Połącz ponownie w Ustawieniach
      </Link>
    </div>
  )
}
