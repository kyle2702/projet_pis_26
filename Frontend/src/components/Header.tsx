import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import './Header.css';
import { getFirestoreDb } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Fermer le menu au clic/touch en dehors
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      const btn = menuBtnRef.current;
      const drop = dropdownRef.current;
      if (!target) return;
      // Si clic dans le bouton ou dans le menu, on ne ferme pas
      if ((btn && btn.contains(target)) || (drop && drop.contains(target))) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuOpen]);
  return (
    <header className="header">
      <div className="header-content">
        <button
          ref={menuBtnRef}
          className="menu-btn"
          aria-label="Ouvrir le menu"
          onClick={() => setMenuOpen((v) => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginRight: 24 }}
        >
          <span style={{ display: 'inline-block', width: 32, height: 32 }}>
            <svg width="32" height="32" viewBox="0 0 32 32">
              <rect y="6" width="32" height="4" rx="2" fill="#222" />
              <rect y="14" width="32" height="4" rx="2" fill="#222" />
              <rect y="22" width="32" height="4" rx="2" fill="#222" />
            </svg>
          </span>
        </button>
        {menuOpen && (
          <div ref={dropdownRef} className="dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', borderRadius: 8, padding: '1rem 0', minWidth: 180, zIndex: 1001 }}>
            
            
            <NavLink to="/jobs" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '0.7rem 2rem' }}>Jobs</NavLink>
            <NavLink to="/calendar" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '0.7rem 2rem' }}>Calendrier</NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '0.7rem 2rem' }}>Admin</NavLink>
            )}
            {/* Bouton de déconnexion */}
              {user ? (
                <>
                <NavLink to="/profile" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '0.7rem 2rem' }}>Profil</NavLink>

                  <button
          onClick={async () => {
                      setMenuOpen(false);
                      try {
                        await logout();
            navigate('/', { replace: true });
                      } catch {
            window.location.href = '/';
                      }
                    }}
                    className="nav-link logout-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 2rem', background: 'none', border: 'none', textAlign: 'center', width: '100%', cursor: 'pointer', color: 'red', fontWeight: 'bold' }}
                  >
                    <img src="/deconnexion.png" alt="Déconnexion" style={{ width: 20, height: 20, marginRight: 8 }} />
                    Déconnexion
                  </button>
                </>
              ) : (
                <NavLink to="/" className="nav-link" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '0.7rem 2rem', color: 'green', fontWeight: 'bold' }}>
                  Connexion
                </NavLink>
              )}
          </div>
        )}
        <div className="header-logo-center" style={{ display:'flex', alignItems:'center', gap:16 }}>
          <img src="/pis.png" alt="Logo Pionnier" className="header-logo" />
        </div>
      </div>
    </header>
  );
};

export default Header;