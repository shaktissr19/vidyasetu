'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState } from 'react';

export default function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:          60 * 1000,
        retry:              1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: 'toast-success',
          duration:  3000,
          style: {
            fontFamily: "'Noto Sans', sans-serif",
            fontSize:   '0.875rem',
            fontWeight: 600,
          },
        }}
      />
    </QueryClientProvider>
  );
}
