# notify-api

Backend pour envoyer des notifications push via Firebase Cloud Messaging (FCM) et Web Push.

## 🔧 Configuration

### Variables d'environnement requises

Copiez `.env.example` vers `.env` et configurez :

```bash
# Firebase Admin SDK (JSON du service account)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Web Push VAPID Keys (pour iOS/Safari et navigateurs sans FCM)
WEBPUSH_PUBLIC_KEY=votre_clé_publique_base64
WEBPUSH_PRIVATE_KEY=votre_clé_privée_base64
WEBPUSH_SUBJECT=mailto:votre-email@example.com

# Port du serveur (optionnel)
PORT=3000
```

### Génération des clés VAPID

Si vous n'avez pas encore de clés VAPID :

```bash
cd notify-api
npm install
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log('Public:', k.publicKey); console.log('Private:', k.privateKey)"
```

⚠️ **Important** : 
- La `WEBPUSH_PUBLIC_KEY` doit être la MÊME dans `Frontend/.env.local` (`VITE_WEBPUSH_PUBLIC_KEY`)
- Les clés VAPID sont différentes de votre clé Firebase VAPID (`VITE_FIREBASE_VAPID_KEY`)

## 🚀 Déploiement sur Render

1. Créez un nouveau Web Service sur Render
2. Connectez votre repository GitHub
3. Configurez les variables d'environnement dans Render Dashboard :
   - `FIREBASE_SERVICE_ACCOUNT_JSON` : Contenu du fichier JSON de votre service account
   - `WEBPUSH_PUBLIC_KEY` : Votre clé publique VAPID
   - `WEBPUSH_PRIVATE_KEY` : Votre clé privée VAPID  
   - `WEBPUSH_SUBJECT` : Votre email (ex: `mailto:admin@exemple.com`)

4. Build Command: `cd notify-api && npm install && npm run build`
5. Start Command: `cd notify-api && npm start`

## 📦 Développement local

```bash
cd notify-api
npm install
npm run dev
```

Le serveur démarre sur `http://localhost:3000`

## 🧪 Test

Endpoint de santé : `GET /health`

```bash
curl http://localhost:3000/health
# {"ok":true}
```

