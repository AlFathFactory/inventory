import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { queryClient } from './lib/queryClient'
import { isDesktopRuntime } from './config/platform'

document.documentElement.lang = 'ar'
document.documentElement.dir = 'rtl'

// Desktop startup sync: dynamically imported so the web bundle never pulls in
// the sync pipeline, and deliberately not awaited so rendering never waits on
// it. Whatever it resolves to, the app opens and the local data stays usable.
if (isDesktopRuntime()) {
  void import('./services/desktopSync/startupSync')
    .then(({ runStartupSync }) => runStartupSync())
    .then((result) => {
      if (result.status === 'failed' || result.status === 'skipped') {
        console.warn('Desktop startup sync did not complete', result)
      }
    })
    .catch((error: unknown) => {
      console.error('Desktop startup sync could not start', error)
    })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  </StrictMode>,
)
