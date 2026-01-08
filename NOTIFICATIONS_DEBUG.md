# 🔔 Guide de Débogage des Notifications

## Étapes de diagnostic

### 1. Ouvrir la Console du Navigateur (F12)

Allez dans l'onglet **Console** et recherchez les logs `[FCM]` ou `[SW]`.

### 2. Vérifier les Permissions

```javascript
// Dans la console, tapez :
Notification.permission
```

- `"granted"` ✅ : Notifications autorisées
- `"denied"` ❌ : Notifications bloquées par l'utilisateur
- `"default"` ⚠️ : Permission pas encore demandée

**Si "denied"** : Allez dans les paramètres du navigateur pour réautoriser les notifications pour votre site.

### 3. Vérifier le Service Worker

```javascript
// Dans la console, tapez :
navigator.serviceWorker.ready.then(reg => console.log('SW actif:', reg.active))
```

Ou allez dans **Application** > **Service Workers** (DevTools) et vérifiez que le SW est activé.

### 4. Logs à surveiller

#### ✅ Logs de succès attendus :

```
[FCM] Service worker déjà enregistré
[FCM] Configuration envoyée au service worker
[FCM] ✓ Permission notifications déjà accordée
[FCM] Initialisation du token FCM...
[FCM] Token obtenu, enregistrement dans Firestore...
[FCM] ✓ Token enregistré dans Firestore
[FCM] ✓ Écoute des messages configurée avec succès
```

#### ❌ Erreurs courantes :

**Erreur : "VAPID key manquante"**
- La variable `VITE_FIREBASE_VAPID_KEY` n'est pas définie
- Vérifiez le fichier `.env.local` ou les secrets GitHub

**Erreur : "Service Workers non supportés"**
- Votre navigateur ne supporte pas les notifications
- Testez avec Chrome/Firefox/Edge

**Erreur : "Failed to get token"**
- Le Service Worker n'est pas correctement enregistré
- Vérifiez que `firebase-messaging-sw.js` est accessible à `/firebase-messaging-sw.js`

### 5. Tester l'envoi d'une notification

#### Depuis Firebase Console :

1. Allez sur : https://console.firebase.google.com/project/pionniers-26-a4449/messaging
2. Cliquez sur "New campaign" > "Notifications"
3. Remplissez le titre et le message
4. Cliquez sur "Send test message"
5. Collez votre FCM Token (visible dans la console avec `[FCM] Token:`)

### 6. Vérifier Firestore

Allez dans Firestore et vérifiez que :
- Collection `fcmTokens` existe
- Votre userId a un document avec un `token`
- Le champ `updatedAt` est récent

### 7. Forcer la réinitialisation

Si rien ne fonctionne, essayez :

```javascript
// Dans la console :
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(reg => reg.unregister());
  console.log('Service Workers désinscrits. Rechargez la page.');
});
```

Ensuite, rechargez la page (F5) et reconnectez-vous.

## 🐛 Problèmes spécifiques

### Notifications ne s'affichent pas en arrière-plan

- Vérifiez les logs du Service Worker : Onglet **Application** > **Service Workers** > Cliquez sur "inspect"
- Recherchez `[SW] Firebase Messaging initialisé`

### Notifications ne s'affichent qu'en arrière-plan (pas en foreground)

- Vérifiez que `listenForegroundMessages` est bien appelé
- Cherchez dans les logs : `[FCM] 📬 Notification reçue`

### Notifications dupliquées

- Le système de déduplication est actif (15 secondes)
- Si vous voyez des doublons, vérifiez qu'il n'y a pas deux service workers actifs

## 📱 Test sur mobile

Sur iOS/Safari, Firebase Cloud Messaging ne fonctionne pas. Le système bascule automatiquement sur **Web Push**.

Cherchez dans les logs :
```
[WebPush] Tentative de fallback Web Push...
[WebPush] ✓ Subscription Web Push: true
```

## 🆘 En dernier recours

Si rien ne fonctionne après tout ça :

1. Videz le cache du navigateur (Ctrl+Shift+Suppr)
2. Désinstallez/réinstallez les Service Workers (voir étape 7)
3. Vérifiez que votre backend `notify-api` fonctionne
4. Testez sur un autre navigateur
5. Vérifiez les règles Firestore Security Rules
