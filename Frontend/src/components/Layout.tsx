import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

const Layout: React.FC = () => {
  return (
    <>
      <Header />
      {/* Augmentation du padding-top pour compenser la hauteur du header fixe */}
      <main style={{ paddingTop: '8rem', paddingBottom: '5rem' }}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
};

export default Layout;