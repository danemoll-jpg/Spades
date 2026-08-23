import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Belt-and-suspenders against native pinch-zoom, alongside body's touch-action: pan-x pan-y
// (index.css) — that CSS property is the standards-based way to do this and should be sufficient
// on its own, but touch-action's PINCH-ZOOM restriction specifically (as opposed to its panning
// restriction, which reliably works) has a long history of being unreliable in real iOS/iPadOS
// Safari even when the CSS is correctly applied — the classic, still-commonly-needed fallback is
// intercepting Safari's own proprietary gesture events directly. gesturestart/gesturechange/
// gestureend only exist in WebKit; they're simply never fired anywhere else, so this is a no-op
// on every other browser rather than something that needs feature-detecting.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
