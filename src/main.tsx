import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { installGlobalErrorLogging } from './lib/logger'
import { PreferencesProvider } from './lib/preferences'
import './styles.css'

installGlobalErrorLogging()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider><App /></PreferencesProvider>
  </StrictMode>,
)
