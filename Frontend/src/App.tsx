import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './App.css';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import HourPage from './pages/HourPage';
import AdminPage from './pages/AdminPage';

import { AuthProvider } from './contexts/AuthContext';

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
        path: 'hours',
        element: <HourPage />,
      },
      {
        path: 'admin',
        element: <AdminPage />,
      }
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
