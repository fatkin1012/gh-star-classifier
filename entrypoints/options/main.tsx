import React from 'react';
import ReactDOM from 'react-dom/client';
import OptionsApp from './App.tsx';
import '../popup/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>,
);
