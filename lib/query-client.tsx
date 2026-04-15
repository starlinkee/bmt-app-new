'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minut — dane trzymane w cache bez refetchu
          },
        },
      }),
  )
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
