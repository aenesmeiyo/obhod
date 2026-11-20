import { createRoot } from 'react-dom/client'
import 'glisse/styles.css'
import './styles.css'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

// IPC errors are already surfaced through toasts by the main process.
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault()
})

createRoot(container).render(<App />)
