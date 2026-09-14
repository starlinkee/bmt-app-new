// Wykrywanie warstwy środowiska na potrzeby organizacji plików (Drive, Supabase Storage).
// VERCEL_ENV jest ustawiane tylko na Vercelu ('preview' | 'production'); lokalny
// `next dev` / `vercel dev` nie ustawia go wcale, więc traktujemy to jako DEVELOPMENT.
export type EnvTier = 'DEVELOPMENT' | 'PREVIEW' | 'PRODUCTION'

export function getEnvTier(): EnvTier {
  const env = process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV
  if (env === 'production') return 'PRODUCTION'
  if (env === 'preview') return 'PREVIEW'
  return 'DEVELOPMENT'
}
