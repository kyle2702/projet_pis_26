/**
 * Toast notification component for better UX
 */

import React, { useEffect, useState } from 'react';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'info', 
  duration = 3000,
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, 300);
  };

  if (!isVisible) return null;

  const colors = {
    success: {
      bg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      icon: '✓'
    },
    error: {
      bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      icon: '✕'
    },
    info: {
      bg: 'var(--primary-gradient)',
      icon: 'ℹ'
    }
  };

  const config = colors[type];

  return (
    <div
      style={{
        position: 'fixed',
        top: '2rem',
        right: '2rem',
        zIndex: 9999,
        background: config.bg,
        color: 'white',
        padding: '1rem 1.5rem',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        minWidth: '280px',
        maxWidth: '400px',
        animation: isLeaving ? 'slideOut 0.3s ease-out' : 'slideIn 0.3s ease-out',
        transform: isLeaving ? 'translateX(120%)' : 'translateX(0)',
        transition: 'transform 0.3s ease-out',
        fontWeight: 500
      }}
    >
      <span style={{ fontSize: '1.25rem' }}>{config.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={handleClose}
        style={{
          background: 'rgba(255, 255, 255, 0.2)',
          border: 'none',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'white',
          fontSize: '1rem',
          fontWeight: 'bold',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
        }}
      >
        ×
      </button>
    </div>
  );
};

// Hook personnalisé pour gérer les toasts
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const [toasts, setToasts] = useState<Array<{ id: number; props: ToastProps }>>([]);
  let nextId = 0;

  const showToast = (message: string, type?: ToastProps['type'], duration?: number) => {
    const id = nextId++;
    const toast = {
      id,
      props: {
        message,
        type,
        duration,
        onClose: () => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }
      }
    };
    
    setToasts(prev => [...prev, toast]);
  };

  const ToastContainer = () => (
    <>
      {toasts.map(toast => (
        <Toast key={toast.id} {...toast.props} />
      ))}
    </>
  );

  return {
    showToast,
    showSuccess: (message: string) => showToast(message, 'success'),
    showError: (message: string) => showToast(message, 'error'),
    showInfo: (message: string) => showToast(message, 'info'),
    ToastContainer
  };
};
