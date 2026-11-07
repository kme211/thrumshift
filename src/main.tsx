import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/tokens.css'
import './styles/global.css'

const Entry =
  window.location.pathname.replace(/\/$/, '') === '/voice-lab'
    ? lazy(() => import('./voice-lab/VoiceLab'))
    : lazy(() => import('./app/App').then(({ App }) => ({ default: App })))

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <Suspense fallback={<p>Loading console…</p>}>
      <Entry />
    </Suspense>
  </StrictMode>,
)
