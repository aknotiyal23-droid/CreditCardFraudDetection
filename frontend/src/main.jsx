import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// The existing local API configuration allows localhost origins. Normalize
// loopback-IP URLs before the dashboard sends any cross-origin API requests.
if (window.location.hostname === '127.0.0.1') {
  const localUrl = new URL(window.location.href)
  localUrl.hostname = 'localhost'
  window.location.replace(localUrl.toString())
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
