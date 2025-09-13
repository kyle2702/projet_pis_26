notify-api

Variables d'environnement requises pour Web Push:
- WEBPUSH_PUBLIC_KEY: clé publique VAPID (Base64 URL-safe)
- WEBPUSH_PRIVATE_KEY: clé privée VAPID
- WEBPUSH_SUBJECT: contact (mailto:...)

Pour générer des clés VAPID (en local):
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"

Déploiement: définissez aussi VITE_WEBPUSH_PUBLIC_KEY côté Frontend (.env.local).
