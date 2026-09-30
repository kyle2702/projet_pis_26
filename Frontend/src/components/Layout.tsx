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

  // Mesure de la hauteur du header (position: fixed) pour réserver la place du
  // <main>. Le ResizeObserver se déclenche aussi sur changement de taille de
  // fenêtre: le listener `resize` était redondant. La lecture d'offsetHeight est
  // regroupée dans une seule frame (requestAnimationFrame) pour éviter un layout
  // forcé à chaque événement.
  useEffect(() => {
    const headerElement = document.querySelector<HTMLElement>('.header');
    if (!headerElement) return;

    let frame = 0;
    const measure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        document.documentElement.style.setProperty('--header-height', `${headerElement.offsetHeight}px`);
      });
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(headerElement);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
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