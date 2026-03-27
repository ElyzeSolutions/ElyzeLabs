import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { dashboardQueryClient } from './app/queryClient';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={dashboardQueryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
