import { StrictMode } from 'react'
import { startTheme } from './lib/theme'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/tektur/400.css'
import '@fontsource/tektur/500.css'
import '@fontsource/tektur/600.css'
import '@fontsource/tektur/700.css'
import '@fontsource/tektur/800.css'
import '@fontsource/tektur/900.css'
import '@fontsource/ubuntu-sans/400.css'
import '@fontsource/ubuntu-sans/600.css'
import '@fontsource/ubuntu-sans/700.css'
import '@fontsource/material-symbols-outlined/400.css'
import 'flag-icons/css/flag-icons.min.css'
import './styles.css'
import './career.css'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { installUiDiagnostics } from './lib/uiDiagnostics'
import './hover.css'
import './automation.css'
import './analysis.css'
import './recruitment-hub.css'
import './matches.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

installUiDiagnostics()
void startTheme()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
