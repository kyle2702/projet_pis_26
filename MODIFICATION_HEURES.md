# Modification manuelle des heures

## Fonctionnalité

Cette fonctionnalité permet aux administrateurs de modifier manuellement le nombre d'heures d'un utilisateur directement depuis la page Admin.

## Utilisation

1. **Accédez à la page Admin** avec un compte administrateur
2. Dans le tableau "Utilisateurs et heures prestées", vous verrez une icône de crayon (✏️) à côté du nombre d'heures de chaque utilisateur
3. **Cliquez sur l'icône** pour ouvrir le modal de modification
4. Un **modal de confirmation** s'affiche avec :
   - Le nom de la personne (totem)
   - Les heures actuelles
   - Un champ pour entrer les nouvelles heures
   - La différence calculée automatiquement
5. **Ajustez le nombre d'heures** dans le champ de saisie
6. **Confirmez** en cliquant sur "Confirmer" ou annulez avec "Annuler"

## Message de confirmation

Le modal affiche clairement :
```
⚠️ Confirmation de modification

Attention, êtes-vous sûr de vouloir enregistrer la modification ?

Personne : [Nom du pionnier]
Heures actuelles : [X]h
Nouvelles heures : [Y]h
Différence : [±Z]h
```

## Stockage des données

- Les heures modifiées manuellement sont stockées dans Firestore dans le document utilisateur (`users/{uid}`)
- Le champ utilisé est `manualHours`
- Une fois modifiées manuellement, ces heures **remplacent** le calcul automatique basé sur les jobs
- Pour revenir au calcul automatique, il suffit de supprimer le champ `manualHours` du document utilisateur dans Firestore

## Cas d'usage

Cette fonctionnalité est particulièrement utile pour :
- Ajuster les heures lorsqu'une personne doit quitter un job plus tôt
- Corriger des erreurs de saisie
- Ajouter des heures pour du travail effectué en dehors du système de jobs
- Compenser des heures perdues ou mal enregistrées

## Sécurité

- Seuls les administrateurs peuvent modifier les heures
- Un message de confirmation empêche les modifications accidentelles
- L'affichage avant/après permet de vérifier les modifications avant validation
