import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { queryClient } from './lib/queryClient'
import { initializeLocalDb } from './lib/localDb'

document.documentElement.lang = 'ar'
document.documentElement.dir = 'rtl'

void initializeLocalDb().catch((error: unknown) => {
  console.error('Failed to initialize local database', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  </StrictMode>,
)
