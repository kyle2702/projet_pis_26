import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

const Layout: React.FC = () => {
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