import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './app/App'
import { AuthProvider } from './features/auth/AuthProvider'
import './shared/styles/index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('ExamGuard root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
