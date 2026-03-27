import { useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'sonner';

import { createDashboardRouter } from './app/router';

export default function App() {
  const [router] = useState(() => createDashboardRouter());

  return (
    <>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'rgba(22, 27, 35, 0.94)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#eef2f1',
            backdropFilter: 'blur(18px)',
            boxShadow: '0 18px 60px rgba(0, 0, 0, 0.28)'
          }
        }}
      />
    </>
  );
}
