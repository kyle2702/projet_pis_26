import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initDiagnostics } from './dev/diagnostics'

// Phase 0 : sonde de mesure. Noop en production sauf si activée via ?diag=1
// (ou ?diag=badge pour un affichage visible sur mobile).
initDiagnostics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
