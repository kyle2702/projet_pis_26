/**
 * Composant avec lazy loading pour afficher les JobCards progressivement
 * Optimisé pour mobile avec Intersection Observer
 */

import React, { useEffect, useRef, useState } from 'react';

interface LazyJobCardProps {
  children: React.ReactNode;
  index: number;
  threshold?: number;
}

export const LazyJobCard: React.FC<LazyJobCardProps> = ({ 
  children, 
  index,
  threshold = 0.1 
}) => {
  const [isVisible, setIsVisible] = useState(index < 3); // Les 3 premiers sont visibles immédiatement
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Si déjà visible, pas besoin d'observer
    if (isVisible) return;

    const currentRef = cardRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Une fois visible, on arrête d'observer
          if (currentRef) {
            observer.unobserve(currentRef);
          }
        }
      },
      {
        threshold,
        rootMargin: '100px' // Commence à charger 100px avant d'être visible
      }
    );

    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [isVisible, threshold]);

  return (
    <div ref={cardRef} style={{ width: '100%' }}>
      {isVisible ? (
        children
      ) : (
        // Placeholder léger pendant le chargement
        <div style={{
          height: '220px',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)'
        }} />
      )}
    </div>
  );
};
