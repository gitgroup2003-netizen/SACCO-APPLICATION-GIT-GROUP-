import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// If any screen crashes, show a clear message and a reload button instead of a blank white page.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Amani SACCO crashed:', error, info && info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#FAF7F0', color: '#16241F' }}>
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#5B6B62' }}>
            The page could not be shown. Your data is safe — nothing was changed. Reload to try again; if it keeps happening, tell the SACCO office what you were doing.
          </p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '11px 22px', borderRadius: 12, border: 'none', background: '#0F3D3A', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Reload</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore registration failures */ });
  });
}
