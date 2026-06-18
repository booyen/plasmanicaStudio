import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { restoreFromHash } from './share.js';
import './index.css';

// Restore a shared config before first render so the renderer mounts with it.
restoreFromHash();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
