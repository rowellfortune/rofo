import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './state/AuthContext';
import { PoolsProvider } from './state/PoolsContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PoolsProvider>
          <App />
        </PoolsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
