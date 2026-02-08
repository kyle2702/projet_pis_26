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
const QuizzPage = lazy(() => import('./pages/QuizzPage'));
const PointsPage = lazy(() => import('./pages/PointsPage'));
//const ValentinePage = lazy(() => import('./pages/ValentinePage'));

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
  // Routes cachées pour le quizz (hors du Layout)
  {
    path: '/quizz',
    element: <QuizzPage />,
  },
  {
    path: '/points',
    element: <PointsPage />,
  },
  /* Route spéciale Saint-Valentin (hors du Layout)
  {
    path: '/valentine',
    element: <ValentinePage />,
  },*/
  { path: '*', element: <div style={{ padding: 24 }}>Page non trouvée</div> },
]);

function App() {
  // Mettre à `true` pour activer l'écran de hack
  const [isHacked, setIsHacked] = useState(false); 

  const handleUnlock = () => {
    setIsHacked(false);
  };

  if (isHacked) {
    return <HackedScreen onUnlock={handleUnlock} />;
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

