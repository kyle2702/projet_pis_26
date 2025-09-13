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
    const publicPaths = ['/jobs', '/calendar'];
    const isPublic = publicPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));
    if (!isLoading && !user && location.pathname !== '/' && !isPublic) {
      navigate('/', { replace: true });
    }
  }, [user, isLoading, location.pathname, navigate]);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const headerElement = document.querySelector<HTMLElement>('.header');
      if (headerElement) {
        const headerHeight = headerElement.offsetHeight;
        document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
      }
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    const headerElement = document.querySelector('.header');
    if (headerElement) {
      resizeObserver.observe(headerElement);
    }

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      if (headerElement) {
        resizeObserver.unobserve(headerElement);
      }
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main 
        className="flex-grow w-full mx-auto px-4 sm:px-6 pb-4 max-w-screen-sm md:max-w-3xl lg:max-w-5xl xl:max-w-6xl" 
        style={{ paddingTop: 'var(--header-height)' }}
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default Layout;