import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { NavLink } from 'react-router-dom';
import './Header.css';

const Header: React.FC = () => {
  const { user } = useAuth();
  return (
    <header className="header">
      <div className="header-content">
        <nav className="header-nav">
          <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            HomePage
          </NavLink>
          <NavLink to="/hours" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Mes Heures
          </NavLink>
          {user?.id === 1 && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="header-logo-center">
          <img src="/pis.png" alt="Logo Pionnier" className="header-logo" />
        </div>
      </div>
    </header>
  );
};

export default Header;