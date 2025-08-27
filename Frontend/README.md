# Frontend Hours (React + TS + Vite) avec Firebase

## Configuration Firebase

1. Copiez `.env.example` vers `.env.local` et remplissez les variables avec la configuration Web de votre projet Firebase (Console Firebase > Paramètres du projet > Vos apps > SDK Web).
2. Activez Authentication (Email/Password et/ou Google) dans la Console.
3. Activez Cloud Firestore et appliquez des règles minimales (à adapter):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, update: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/hours/{hourId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Lecture admin globale: nécessite isAdmin=true sur le doc de l'appelant
    match /users/{userId} {
      allow list: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
  }
}
```

## Démarrer

- Installation: `npm i`
- Dév: `npm run dev`
- Build: `npm run build`

## Modèle de données

- Profil: `users/{uid}` avec `email`, `displayName`, `isAdmin` (bool), `totalHours` (number optionnel).
- Heures: `users/{uid}/hours/{docId}` avec `{ title: string, date: string, hours: number }`.
