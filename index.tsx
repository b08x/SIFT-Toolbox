import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App'; // Changed from '@/App' to './App' and named import
// import '@/index.css'; // Removed as styles are handled by Tailwind CDN and inline styles

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);