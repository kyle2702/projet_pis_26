import React, { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { useAuth } from '../contexts/AuthContext';

const Layout: React.FC = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !user && location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [user, isLoading, location.pathname, navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Header />
      {/* Augmentation du padding-top pour compenser la hauteur du header fixe */}
      <main
        style={{
          /* header fixe: utiliser clamp pour s'adapter aux petits écrans */
          paddingTop: 'clamp(5rem, 12vw, 8rem)',
          paddingBottom: 0,
          flex: 1,
        }}
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default Layout;