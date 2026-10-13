import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './store/store'
import { controllerRef } from './canvas/controller'

if (import.meta.env.DEV) Object.assign(window, { __store: useStore, __controller: controllerRef })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
