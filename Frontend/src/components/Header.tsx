import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { NavLink } from 'react-router-dom';
import './Header.css';
import { getFirestoreDb } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

const Header: React.FC = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setIsAdmin(false); return; }
      try {
        const db = getFirestoreDb();
        const snap = await getDoc(doc(db, 'users', user.uid));
        const val = snap.exists() && snap.data().isAdmin === true;
        if (!cancelled) setIsAdmin(!!val);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);
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
          {isAdmin && (
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