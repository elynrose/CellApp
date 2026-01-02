import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import SubscriptionSuccess from './pages/SubscriptionSuccess.jsx'
import SubscriptionCancel from './pages/SubscriptionCancel.jsx'
import NotFound from './pages/NotFound.jsx'
import ProjectsPage from './pages/ProjectsPage.jsx'

// Add error logging
window.addEventListener('error', (event) => {
});

window.addEventListener('unhandledrejection', (event) => {
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/subscription-success" element={<SubscriptionSuccess />} />
          <Route path="/subscription-cancel" element={<SubscriptionCancel />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
