import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Élément racine #root introuvable dans le document')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
