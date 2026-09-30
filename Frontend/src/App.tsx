import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Suspense, lazy, useState } from 'react';
import './App.css';
import Layout from './components/Layout';
const HomePage = lazy(() => import('./pages/HomePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
// Écran "hack" (easter egg): chargé à la demande, comme ses GIF (~3,2 Mo), et
// jamais téléchargé puisqu'il n'est affiché que sur demande explicite.
const HackedScreen = lazy(() => import('./components/HackedScreen'));

import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './ErrorBoundary';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'jobs',
        element: <JobsPage />,
      },
      {
        path: 'history',
        element: <HistoryPage />,
      },
      {
        path: 'calendar',
        element: <CalendarPage />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
      {
        path: 'admin',
        element: <AdminPage />,
      }
    ],
  },
  { path: '*', element: <div style={{ padding: 24 }}>Page non trouvée</div> },
]);

function App() {
  // Mettre à `true` pour activer l'écran de hack
  const [isHacked, setIsHacked] = useState(false); 

  const handleUnlock = () => {
    setIsHacked(false);
  };

  if (isHacked) {
    return (
      <Suspense fallback={null}>
        <HackedScreen onUnlock={handleUnlock} />
      </Suspense>
    );
  }

  return (
    <AuthProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <Suspense fallback={<div style={{ padding: 24 }}>Chargement…</div>}>
            <RouterProvider router={router} />
          </Suspense>
        </ErrorBoundary>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;

