import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import './Header.css';
// Firestore read removed; we rely on AuthContext for admin status

const Header: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
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
          style={{ 
            background: 'rgba(255, 255, 255, 0.2)', 
            border: '1px solid rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(10px)',
            cursor: 'pointer', 
            padding: 10,
            marginRight: 24,
            borderRadius: 'var(--radius-md)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <span style={{ display: 'inline-block', width: 32, height: 32 }}>
            <svg width="32" height="32" viewBox="0 0 32 32">
              <rect y="6" width="32" height="4" rx="2" fill="white" />
              <rect y="14" width="32" height="4" rx="2" fill="white" />
              <rect y="22" width="32" height="4" rx="2" fill="white" />
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
          onClick={() => {
                      setMenuOpen(false);
                      // Navigation immédiate, puis déconnexion en arrière-plan
                      navigate('/', { replace: true });
                      logout().catch(() => {
                        // En cas d'échec improbable, on force le rechargement
                        window.location.href = '/';
                      });
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