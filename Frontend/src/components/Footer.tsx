import React from 'react';
import './Footer.css';

const Footer: React.FC = () => {
  return (
  <footer className="footer w-full pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <p>Développé par Cansse Kyle</p>
      <p>© 2025 Tous droits réservés</p>
    </footer>
  );
};

export default Footer;