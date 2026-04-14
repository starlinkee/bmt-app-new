import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    n: 1,
    title: "Clone & install",
    code: "git clone https://github.com/starlinkee/webapp-template.git && npm install",
  },
  {
    n: 2,
    title: "Zmienne środowiskowe",
    code: "cp .env.example .env.local",
    note: "Uzupełnij klucze — instrukcja poniżej.",
  },
  {
    n: 3,
    title: "Supabase (opcjonalnie)",
    note: "Utwórz projekt → wklej URL + klucze → npm run db:push",
  },
  {
    n: 4,
    title: "Stripe",
    note: "Utwórz produkt/cenę w Dashboard → wklej klucze → skonfiguruj webhook.",
    code: "npm run stripe:listen",
  },
  {
    n: 5,
    title: "Resend",
    note: "Zweryfikuj domenę w DNS → wklej RESEND_API_KEY.",
  },
  {
    n: 6,
    title: "Vercel env sync",
    note: "Uzupełnij VERCEL_ACCESS_TOKEN + VERCEL_PROJECT_ID w .env.local.",
    code: "npm run vercel:env",
  },
  {
    n: 7,
    title: "Deploy",
    code: "git push origin master",
    note: "Vercel auto-deployuje po każdym pushu do main.",
  },
];

const envGroups = [
  {
    label: "Supabase",
    vars: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    optional: true,
  },
  {
    label: "Stripe",
    vars: [
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID",
    ],
    optional: false,
  },
  {
    label: "Resend",
    vars: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
    optional: false,
  },
  {
    label: "Vercel",
    vars: ["VERCEL_ACCESS_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"],
    optional: false,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-12">

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">webapp-template</h1>
          <p className="text-muted-foreground">
            Baza pod każdy projekt SaaS. Nadpisz{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono">app/page.tsx</code>{" "}
            własną landing page i zacznij budować.
          </p>
          <a
            href="https://github.com/starlinkee/webapp-template"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            starlinkee/webapp-template
          </a>
          <div className="flex flex-wrap gap-2 pt-1">
            {["Next.js 16", "TypeScript", "Tailwind v4", "Supabase", "Stripe", "Resend"].map(
              (t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              )
            )}
          </div>
        </div>

        {/* Setup steps */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Setup w 7 krokach</h2>
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {s.n}
                </span>
                <div className="space-y-1">
                  <p className="font-medium leading-snug">{s.title}</p>
                  {s.note && (
                    <p className="text-sm text-muted-foreground">{s.note}</p>
                  )}
                  {s.code && (
                    <code className="block rounded bg-muted px-3 py-1.5 text-sm font-mono">
                      {s.code}
                    </code>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Env vars reference */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Zmienne środowiskowe</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {envGroups.map((g) => (
              <Card key={g.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {g.label}
                    {g.optional && (
                      <Badge variant="outline" className="text-xs font-normal">
                        opcjonalne
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {g.vars.map((v) => (
                      <li key={v}>
                        <code className="text-xs font-mono text-muted-foreground">{v}</code>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Commands */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Komendy</h2>
          <div className="rounded-lg border bg-muted/40 divide-y divide-border text-sm font-mono">
            {[
              ["npm run dev", "serwer deweloperski"],
              ["npm run build", "build produkcyjny"],
              ["npm run typecheck", "sprawdzenie typów"],
              ["npm run lint", "linter"],
              ["npm run db:types", "generowanie typów Supabase"],
              ["npm run db:push", "migracje do Supabase"],
              ["npm run stripe:listen", "przekierowanie webhooków Stripe na localhost"],
              ["npm run vercel:env", "push zmiennych do Vercel przez API"],
            ].map(([cmd, desc]) => (
              <div key={cmd} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="text-foreground">{cmd}</span>
                <span className="text-right text-xs text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
