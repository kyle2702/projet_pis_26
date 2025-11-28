import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Suspense, lazy, useState } from 'react';
import './App.css';
import Layout from './components/Layout';
import HackedScreen from './components/HackedScreen';
const HomePage = lazy(() => import('./pages/HomePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));

import { AuthProvider } from './contexts/AuthContext';
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
  const [isHacked, setIsHacked] = useState(true); 

  const handleUnlock = () => {
    setIsHacked(false);
  };

  if (isHacked) {
    return <HackedScreen onUnlock={handleUnlock} />;
  }

  return (
    <AuthProvider>
      <ErrorBoundary>
        <Suspense fallback={<div style={{ padding: 24 }}>Chargement…</div>}>
          <RouterProvider router={router} />
        </Suspense>
      </ErrorBoundary>
    </AuthProvider>
  );
}

export default App;

