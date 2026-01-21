import React from 'react';
import ReactDOM from 'react-dom/client';
import 'animate.css';
import './styles/global.css';
import './styles/tour.css';
import './styles/checkbox.css';
import './styles/loader.css';
import './styles/dashboard.css';
import './styles/theme-toggle.css';
import App from './App';
import { ThemeProvider } from './components/ThemeContext';

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null };

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('RootErrorBoundary caught error:', error, info);
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-[100dvh] w-full items-center justify-center bg-white text-gray-800">
          <div className="max-w-md text-center">
            <h2 className="text-lg font-bold">App failed to load</h2>
            <p className="mt-2 text-sm text-gray-600">We logged the error. Please refresh and try again.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ThemeProvider>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </ThemeProvider>
);

// Register Service Worker for PWA and Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}