import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Initialize analytics if enabled
if (import.meta.env.VITE_ANALYTICS_ENABLED === 'true') {
  const initAnalytics = async () => {
    try {
      // This would be replaced with your actual analytics initialization
      console.info('Analytics initialized');
      
      // Track page view
      window.trackPageView(window.location.pathname);
    } catch (error) {
      // Silently handle analytics initialization errors
      console.error('Analytics initialization error:', error);
    }
  };
  
  // Simple analytics tracking functions
  window.trackPageView = (path: string) => {
    if (import.meta.env.PROD) {
      // This would be replaced with actual analytics tracking code
      console.info(`Page view: ${path}`);
    }
  };
  
  window.trackEvent = (category: string, action: string, label?: string, value?: number) => {
    if (import.meta.env.PROD) {
      // This would be replaced with actual analytics tracking code
      console.info(`Event: ${category} - ${action} - ${label || ''} - ${value || ''}`);
    }
  };
  
  // Initialize analytics
  initAnalytics();
}

// Add these types to the global Window interface
declare global {
  interface Window {
    trackPageView: (path: string) => void;
    trackEvent: (category: string, action: string, label?: string, value?: number) => void;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
