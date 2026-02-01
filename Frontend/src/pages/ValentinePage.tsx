import { useState } from 'react';
import './ValentinePage.css';

export default function ValentinePage() {
  const [noButtonPosition, setNoButtonPosition] = useState({ top: 50, left: 70 });
  const [yesButtonSize, setYesButtonSize] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [hearts, setHearts] = useState<Array<{ id: number; left: number; delay: number }>>([]);

  const handleNoClick = () => {
    // Augmenter la taille du bouton "Oui"
    setYesButtonSize(prev => prev + 0.3);

    // Positionner le bouton "Non" à un endroit aléatoire
    const newTop = Math.random() * 70 + 10; // Entre 10% et 80%
    const newLeft = Math.random() * 70 + 10; // Entre 10% et 80%
    setNoButtonPosition({ top: newTop, left: newLeft });
  };

  const handleYesClick = () => {
    setShowSuccess(true);
    
    // Créer des cœurs qui tombent
    const newHearts = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
    }));
    setHearts(newHearts);
  };

  if (showSuccess) {
    return (
      <div className="valentine-container success">
        {hearts.map(heart => (
          <div
            key={heart.id}
            className="falling-heart"
            style={{
              left: `${heart.left}%`,
              animationDelay: `${heart.delay}s`,
            }}
          >
            ❤️
          </div>
        ))}
        <div className="success-message">
          <div className="big-heart">💖</div>
          <h1>Maintenant que tu as cliqué sur oui</h1>
          <h2>tu ne peux plus revenir en arrière :)</h2>
          <div className="rose-petals">🌹✨🌹</div>
        </div>
      </div>
    );
  }

  return (
    <div className="valentine-container">
      <div className="valentine-card">
        <h1 className="valentine-title">Will you be my Valentine? ❤️</h1>
        <h2 className="valentine-subtitle">(Pour le barpi du 13)</h2>
        
        <div className="buttons-container">
          <button
            className="yes-button"
            onClick={handleYesClick}
            style={{
              transform: `translate(-50%, -50%) scale(${yesButtonSize})`,
            }}
          >
            Oui 😍
          </button>
          
          <button
            className="no-button"
            onClick={handleNoClick}
            style={{
              position: 'absolute',
              top: `${noButtonPosition.top}%`,
              left: `${noButtonPosition.left}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            Non 😢
          </button>
        </div>
      </div>
    </div>
  );
}
