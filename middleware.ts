import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Gdy klucze Supabase nie są ustawione — no-op.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return;
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Pomijamy pliki statyczne Next.js i zasoby, które nie potrzebują sesji:
     * _next/static, _next/image, favicon.ico, pliki z rozszerzeniem
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
