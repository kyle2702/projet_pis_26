# Pages Quizz - Documentation

## Vue d'ensemble

Ce module ajoute deux pages pour gérer un système de quizz avec classement en temps réel :

1. **Page Classement** (`/quizz-classement-secret`) - Affiche le classement des équipes
2. **Page Gestion** (`/quizz-gestion-secret`) - Permet d'ajouter et gérer les équipes

## Caractéristiques

### 🔐 Sécurité
- Les deux pages sont protégées par mot de passe : **Azara**
- URLs secrètes, non accessibles via la navigation normale
- Authentification stockée dans la session (perdue à la fermeture du navigateur)

### 🔄 Mise à jour en temps réel
- Utilise le **pattern Observer** via Firestore listeners (`onSnapshot`)
- Les changements de score sont instantanément reflétés sur la page classement
- Aucun rafraîchissement manuel nécessaire

### 📊 Fonctionnalités

#### Page Classement (`/quizz-classement-secret`)
- Affiche jusqu'à 22 équipes
- Classement automatique par score (décroissant)
- Médailles pour le top 3 (🥇 🥈 🥉)
- Indicateur "En direct" avec animation
- Design visuel attractif avec animations

#### Page Gestion (`/quizz-gestion-secret`)
- Ajout d'équipes (nom uniquement, score initial à 0)
- Limite de 22 équipes
- Modification des scores :
  - Boutons +/- pour ajustement rapide
  - Champ de saisie pour modification directe
  - Scores ne peuvent pas être négatifs
- Suppression d'équipes avec confirmation
- Compteur d'équipes actives

## Structure des données Firestore

Collection : `quizz-teams`

```typescript
{
  id: string,        // ID auto-généré par Firestore
  name: string,      // Nom de l'équipe (max 50 caractères)
  score: number      // Score de l'équipe (>= 0)
}
```

## Utilisation

### Démarrage d'un quizz

1. Accéder à `/quizz-gestion-secret`
2. Entrer le mot de passe : **Azara**
3. Ajouter les équipes participantes
4. Projeter la page `/quizz-classement-secret` sur un écran
5. Entrer le même mot de passe
6. Modifier les scores depuis la page de gestion

### Affichage du classement

- Ouvrir `/quizz-classement-secret` dans un navigateur
- Le classement se met à jour automatiquement
- Aucune interaction nécessaire
- Idéal pour projection sur grand écran

## Déploiement

### Règles Firestore

Les règles Firestore ont été mises à jour pour autoriser les opérations sur `quizz-teams` :

```javascript
match /quizz-teams/{teamId} {
  allow read: if true;
  allow create, update, delete: if true;
}
```

⚠️ **Important** : Déployer les règles Firestore avec la commande :
```bash
firebase deploy --only firestore:rules
```

### Routes

Les routes sont ajoutées dans `App.tsx` en dehors du `Layout` pour éviter l'affichage du header/footer :

```typescript
{
  path: '/quizz-classement-secret',
  element: <QuizzPage />,
},
{
  path: '/quizz-gestion-secret',
  element: <PointsPage />,
}
```

## Fichiers créés

- `Frontend/src/pages/QuizzPage.tsx` - Page de classement
- `Frontend/src/pages/QuizzPage.css` - Styles du classement
- `Frontend/src/pages/PointsPage.tsx` - Page de gestion
- `Frontend/src/pages/PointsPage.css` - Styles de gestion
- `QUIZZ_README.md` - Cette documentation

## Technologies utilisées

- **React** avec TypeScript
- **Firestore** pour le stockage en temps réel
- **Firestore Listeners** (onSnapshot) pour l'observabilité
- **SessionStorage** pour l'authentification temporaire
- **CSS3** avec animations et transitions

## Personnalisation

### Changer le mot de passe

Modifier la ligne dans les deux fichiers :

```typescript
// QuizzPage.tsx et PointsPage.tsx
if (password === 'Azara') {  // Remplacer 'Azara' par le nouveau mot de passe
```

### Modifier la limite d'équipes

```typescript
// PointsPage.tsx
if (teams.length >= 22) {  // Changer 22 par la nouvelle limite
```

### Personnaliser les couleurs

Les CSS utilisent des gradients personnalisables :
- **Classement** : violet/mauve (`#667eea`, `#764ba2`)
- **Gestion** : rose/rouge (`#f093fb`, `#f5576c`)

## Notes techniques

- Les IDs Firestore sont générés automatiquement
- Les scores sont triés côté Firestore avec `orderBy('score', 'desc')`
- Les listeners se nettoient automatiquement au démontage du composant
- Responsive design pour mobile et desktop
- Animations CSS pour une meilleure UX
