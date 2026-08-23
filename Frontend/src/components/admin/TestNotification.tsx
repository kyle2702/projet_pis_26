/**
 * Composant pour tester l'envoi de notifications
 */

import React, { useState } from 'react';
import type { NotificationResult } from '../../types/admin.types';

interface TestNotificationProps {
  onSend: (title: string, body: string) => Promise<NotificationResult>;
}

export const TestNotification: React.FC<TestNotificationProps> = ({ onSend }) => {
  const [title, setTitle] = useState('Notification de test');
  const [body, setBody] = useState('Ceci est un test de notification envoyé uniquement à moi-même');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSend = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const result = await onSend(title, body);
      
      let statusMsg = '✓ Notification test envoyée !\n';
      if (result.sentFCM) statusMsg += '• FCM: ✓ Envoyé\n';
      else if (result.hasToken) statusMsg += '• FCM: ⚠️ Token trouvé mais non envoyé\n';
      else statusMsg += '• FCM: ✗ Aucun token enregistré\n';
      
      if (result.sentWebPush) statusMsg += '• Web Push: ✓ Envoyé\n';
      else if (result.hasSub) statusMsg += '• Web Push: ⚠️ Subscription trouvée mais non envoyée\n';
      else statusMsg += '• Web Push: ✗ Aucune subscription\n';

      if (result.debug) {
        statusMsg += '\n--- Debug backend ---\n';
        statusMsg += `• tokenCount: ${result.debug.tokenCount ?? 0}\n`;
        statusMsg += `• fcmSuccess/failure: ${result.debug.fcmSuccessCount ?? 0}/${result.debug.fcmFailureCount ?? 0}\n`;
        statusMsg += `• cleaned invalid tokens: ${result.debug.invalidTokenCleanupCount ?? 0}\n`;
        statusMsg += `• webPushConfigured: ${result.debug.webPushConfigured ? 'yes' : 'no'}\n`;

        if (result.debug.fcmErrors && result.debug.fcmErrors.length > 0) {
          statusMsg += '• FCM errors:\n';
          result.debug.fcmErrors.forEach((err, idx) => {
            statusMsg += `  ${idx + 1}) ${err.code} [..${err.tokenSuffix}] ${err.message}\n`;
          });
        }

        if (result.debug.webPushError) {
          statusMsg += `• WebPush error: ${result.debug.webPushError.statusCode ?? 'n/a'} ${result.debug.webPushError.message}\n`;
        }
      }
      
      statusMsg += '\nVérifiez la cloche de notification.';
      setMessage(statusMsg);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Backend')) {
        setMessage('✓ Notification créée dans Firestore.\n⚠️ Erreur lors de l\'envoi FCM (backend inaccessible).');
      } else {
        setMessage('✗ Erreur lors de l\'envoi de la notification');
      }
    } finally {
      setLoading(false);
    }
  };

  const styles: { [key: string]: React.CSSProperties } = {
    h2: {
      marginBottom: '1rem',
      color: '#646cff',
    }
  };

  return (
    <div style={{ marginTop: 60, maxWidth: 500, width: '100%', padding: '0 20px' }}>
      <h2 style={styles.h2}>🔔 Tester les notifications</h2>
      <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
        Envoyez une notification test à vous-même sans déranger les autres utilisateurs.
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#333' }}>
            Titre de la notification
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre..."
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid #ddd',
              fontSize: '1rem',
              fontFamily: 'inherit'
            }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#333' }}>
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Contenu de la notification..."
            rows={3}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid #ddd',
              fontSize: '1rem',
              fontFamily: 'inherit',
              resize: 'vertical'
            }}
          />
        </div>
        
        <button
          onClick={handleSend}
          disabled={loading || !title.trim()}
          style={{
            padding: '0.875rem 1.5rem',
            backgroundColor: loading || !title.trim() ? '#ccc' : '#646cff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: loading || !title.trim() ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!loading && title.trim()) {
              e.currentTarget.style.backgroundColor = '#535ac8';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading && title.trim()) {
              e.currentTarget.style.backgroundColor = '#646cff';
            }
          }}
        >
          {loading ? '⏳ Envoi en cours...' : '📤 Envoyer la notification test'}
        </button>
        
        {message && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '8px',
            backgroundColor: message.startsWith('✓') ? '#e8f5e9' : message.startsWith('⚠️') ? '#fff3e0' : '#ffebee',
            color: message.startsWith('✓') ? '#2e7d32' : message.startsWith('⚠️') ? '#e65100' : '#c62828',
            fontSize: '0.85rem',
            fontWeight: 500,
            whiteSpace: 'pre-line',
            fontFamily: 'monospace',
            lineHeight: 1.6
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};
