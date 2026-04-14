import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          fontSize: 'var(--text-sm)',
          boxShadow: 'var(--shadow-lg)',
        },
        success: { iconTheme: { primary: 'var(--color-success)', secondary: '#fff' } },
        error:   { iconTheme: { primary: 'var(--color-error)',   secondary: '#fff' } },
      }}
    />
  </BrowserRouter>
)
