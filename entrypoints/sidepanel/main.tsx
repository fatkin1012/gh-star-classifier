import React from 'react';
import ReactDOM from 'react-dom/client';
import SidePanelApp from './SidePanelApp.tsx';
import '../popup/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanelApp />
  </React.StrictMode>,
);
