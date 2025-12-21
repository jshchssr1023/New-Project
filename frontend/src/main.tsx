import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { CarSelectionProvider } from './contexts/CarSelectionContext';
import { CollaborationProvider } from './contexts/CollaborationContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { UndoRedoProvider } from './contexts/UndoRedoContext';
import GlobalLoadingIndicator from './components/GlobalLoadingIndicator';
import './index.css';

// Create a QueryClient with default options
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      retry: 3,
      refetchOnWindowFocus: true,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LoadingProvider>
          <UndoRedoProvider>
            <AuthProvider>
              <WebSocketProvider>
                <CollaborationProvider>
                  <CarSelectionProvider>
                    <GlobalLoadingIndicator />
                    <App />
                  </CarSelectionProvider>
                </CollaborationProvider>
              </WebSocketProvider>
            </AuthProvider>
          </UndoRedoProvider>
        </LoadingProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
