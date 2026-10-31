import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { PoolsProvider } from './state/PoolsContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PoolsProvider>
        <App />
      </PoolsProvider>
    </BrowserRouter>
  </StrictMode>,
);
