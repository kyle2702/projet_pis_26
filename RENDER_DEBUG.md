# 🔧 Configuration Backend Render - Guide de Débogage

## Problème : "Token trouvé mais non envoyé"

Ce message indique que votre backend trouve bien le token FCM mais ne réussit pas à envoyer la notification.

## ✅ Checklist Render

### 1. Vérifier que le service est actif

Allez sur : https://dashboard.render.com/

- Votre service `notify-api` doit être en état **"Active"** (vert)
- S'il est en rouge ou "Suspended", cliquez sur "Resume" ou redéployez

### 2. Tester l'endpoint de santé

Dans votre navigateur ou avec curl :

```bash
curl https://projet-pis-26.onrender.com/health
```

Résultat attendu : `{"ok":true}`

Si vous obtenez une erreur ou un timeout, le service est down.

### 3. Vérifier les variables d'environnement

Sur Render Dashboard → Votre service → Environment :

**Variables OBLIGATOIRES :**

| Variable | Description | Exemple |
|----------|-------------|---------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON complet du service account Firebase | `{"type":"service_account",...}` |
| `WEBPUSH_PUBLIC_KEY` | Clé publique VAPID pour Web Push | `BGpgxnLUT...` |
| `WEBPUSH_PRIVATE_KEY` | Clé privée VAPID pour Web Push | `nF8m2x...` |
| `WEBPUSH_SUBJECT` | Email de contact | `mailto:votre-email@example.com` |

⚠️ **Attention :** `WEBPUSH_PUBLIC_KEY` doit être DIFFÉRENTE de `VITE_FIREBASE_VAPID_KEY` !

### 4. Générer les clés VAPID manquantes

Si vous n'avez pas configuré `WEBPUSH_PUBLIC_KEY` et `WEBPUSH_PRIVATE_KEY` :

```bash
cd notify-api
npm install
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log('Public:', k.publicKey); console.log('Private:', k.privateKey)"
```

Copiez les deux clés et ajoutez-les dans Render Environment.

### 5. Vérifier les logs Render

Render Dashboard → Votre service → Logs

Cherchez ces messages :
- ✅ `notify-api listening on :10000` (ou autre port)
- ✅ `[Test] FCM envoyé à ...`
- ❌ `Auth error` → Problème de token Firebase
- ❌ `messaging/invalid-registration-token` → Token FCM périmé
- ❌ `Erreur FCM:` → Problème de configuration Firebase Admin

### 6. Obtenir le Service Account JSON

Si vous n'avez pas le fichier JSON du service account :

1. Allez sur : https://console.firebase.google.com/project/pionniers-26-a4449/settings/serviceaccounts/adminsdk
2. Cliquez sur "Generate new private key"
3. Téléchargez le fichier JSON
4. Copiez TOUT le contenu du fichier (c'est un gros JSON)
5. Collez-le dans Render comme variable d'environnement `FIREBASE_SERVICE_ACCOUNT_JSON`

### 7. Redéployer après changement

Après avoir ajouté/modifié des variables d'environnement :

1. Cliquez sur "Save Changes"
2. Render redémarre automatiquement
3. Attendez 1-2 minutes que le service soit "Active"
4. Testez à nouveau l'envoi de notification

## 🧪 Test manuel depuis Render Logs

Dans l'onglet Shell de Render, vous pouvez tester :

```bash
curl -X POST http://localhost:10000/health
```

## 🔍 Diagnostic avancé

Si le problème persiste, vérifiez dans les logs Render si vous voyez :

```
[Test] FCM envoyé à <votre-uid>
```

- **Si OUI** : Le backend fonctionne, le problème est côté client (service worker)
- **Si NON** : Le backend ne reçoit pas la requête ou a une erreur

## ⚠️ Erreurs courantes

### Erreur : "Invalid token"

- Votre `idToken` côté frontend a expiré
- Reconnectez-vous à l'application

### Erreur : "messaging/invalid-registration-token"

- Le token FCM dans Firestore est périmé
- Déconnectez-vous et reconnectez-vous pour générer un nouveau token

### Service Render en "Suspended"

- Les services gratuits Render s'endorment après 15 min d'inactivité
- Le premier appel peut prendre 30-60 secondes pour "réveiller" le service
- Passez à un plan payant pour éviter ce problème

## 📚 Ressources

- [Dashboard Render](https://dashboard.render.com/)
- [Firebase Service Accounts](https://console.firebase.google.com/project/pionniers-26-a4449/settings/serviceaccounts/adminsdk)
- [Web Push Documentation](https://github.com/web-push-libs/web-push)
