# PERF_BASELINE — Scout · référence « avant / après »

> **Phase 0 du plan de performance.** Aucun comportement métier n'est modifié ici :
> l'objectif de ce fichier est de figer des chiffres, puis de ne plus jamais
> optimiser à l'aveugle. Chaque phase du plan doit venir écrire sa ligne dans la
> [journal des mesures](#journal-des-mesures) en bas de fichier.
>
> Mesures de référence prises le **28/09/2026** sur `main` (`f6a3755`), build de
> production local, Firefox/Chrome desktop.

---

## 1. Les 4 outils de mesure livrés

| Outil | Commande | Ce que ça répond |
| --- | --- | --- |
| **Sonde applicative** (`src/dev/diagnostics.ts` + `src/dev/jobsListenerProbe.ts`) | `npm run dev`, ou `?diag=1` / `?diag=badge` sur n'importe build | Latence vécue (FCP/LCP/INP/CLS), gels du thread, **nombre d'appels Firestore + octets**, **abonnements créés vs libérés** |
| **Sonde runtime sans navigateur** (`scripts/runtime-probe.mjs`) | `npm run probe:runtime` | Démarre le serveur de dev, ouvre Chrome en headless et **écrit `probe-runtime.json`** avec `__diag.report()` + `__probe` : rien à copier à la main. Page publique uniquement (pas de session) |
| **Lighthouse reproductible** (`scripts/audit.mjs`) | `npm run audit:local` ou `npm run audit -- --url=<url>` | Score, FCP/LCP/TBT/CLS/TTI, poids par type, gaspillages |
| **Anatomie du bundle** (`scripts/bundle-anatomy.mjs`) | `npm run build:sourcemap && npm run bundle` | **Quel paquet occupe quel chunk**, et surtout : combien le **premier rendu** télécharge |

> Prérequis de l'outil Lighthouse (une seule fois) : `npm i -D lighthouse`.
> Le script pilote Lighthouse par son API Node et trouve Chrome tout seul
> (variable `CHROME_PATH` pour forcer un autre navigateur). Sans Chrome, l'audit
> s'arrête avec ce message plutôt que de fausser le journal.

### Activer la sonde

| Contexte | Comment |
| --- | --- |
| Développement | Activée d'office (`import.meta.env.DEV`). `window.__diag.report()` dans la console |
| Preview / build de prod / mobile | Ouvrir l'URL avec `?diag=1` (persiste en `localStorage`), `?diag=badge` pour un encart toujours visible en bas à gauche, `?diag=0` pour désactiver |
| Export | `window.__diag.copy()` → JSON complet à coller dans une PR / ce fichier |
| Compteurs d'abonnements | `window.__probe` (alimenté par l'espion du `JobsService`) |

Le badge affiche en continu : FCP, LCP, INP, CLS, nombre et durée des gels,
requêtes Firestore + octets, **abonnements actifs**, horodatage de la 1ʳᵉ requête
Auth et de la 1ʳᵉ requête Firestore. Un clic dans la console donne les
`console.table` détaillées (RPC par type, poids par type, navigation par route).

### 1.1 Comment lire les chiffres (pièges à connaître)

- **`StrictMode` double les effets en dev** : les abonnements sont comptés deux
  fois. Les comparaisons *entre elles* restent valides, les valeurs absolues non.
  ➜ Pour un chiffre officiel : `npm run build && npm run preview` puis `?diag=badge`.
- **La sonde compte les requêtes HTTP visibles par le navigateur.** Le SDK
  Firestore multiplexe tout le temps réel sur **un seul flux** : les `onSnapshot`
  n'apparaissent donc **pas** comme des requêtes. C'est précisément pour ça
  qu'il y a un compteur d'abonnements séparé (`window.__probe`) et un échantillonneur
  de tas mémoire : une fuite d'abonnements ne se voit **que** là.
- **Lighthouse sans cookie** n'atteint que les pages publiques (accueil, CGV,
  confidentialité, connexion). Dashboard, missions, historique = mesure `?diag`
  en navigation réelle.
- **Fuite = pente, pas instantané** : regarder `__diag.report().firestoreListeners.samples`
  après 3 allers-retours Dashboard ↔ Missions. S'il ne redescend jamais à la
  valeur du premier arrêt, il y a fuite.

---


## 2. ÉTAT « AVANT » — mesuré (28/09/2026)

### 2.1 Ce que le premier rendu télécharge (le vrai chiffre)

`npm run build:sourcemap && npm run bundle` — la colonne *origine* suit les
**imports statiques** depuis `index.html`, donc un chunk « séparé » n'est gratuit
que s'il est réellement `lazy`.

| Chunk | Taille | Gzippé | Chargé au premier rendu ? |
| --- | --- | --- | --- |
| `firebase-vendor` | 678.8 Ko | 200.2 Ko | **OUI** (via `index.html`) |
| `index` (app + react-dom) | 208.7 Ko | 66.9 Ko | **OUI** |
| `react-vendor` | 98.3 Ko | 33.2 Ko | **OUI** |
| `index.css` | 11.3 Ko | 3.4 Ko | **OUI** (bloquant le rendu) |
| `calendar-vendor` | 261.3 Ko | 75.6 Ko | non (route Calendrier) |
| `JobsPage` | 35.0 Ko | 8.6 Ko | non |
| 6 autres pages + services | ~95 Ko | ~26 Ko | non |
| **TOTAL premier rendu** | **≈ 997 Ko** | **≈ 304 Ko** | — |
| Total produit (tout compris) | 1 378 Ko | ≈ 410 Ko | — |

> ⚠️ Le `manualChunks` de `vite.config.ts:26-39` ne fait pas ce que son commentaire
> prétend : `react-dom` (182 Ko) atterrit dans le chunk `index`, et `react-vendor`
> ne contient au final que `react-router` (88 Ko) + `react` (7 Ko). Les deux sont
> chargés de toute façon : le découpage actuel n'apporte donc **aucun** gain, il
> ne fait que brouiller la lecture. À corriger en phase 3 (voir §4).

### 2.2 Qui occupe `firebase-vendor` (678.8 Ko, chargé à chaque visite)

| Paquet | Taille estimée | Observations |
| --- | --- | --- |
| `@firebase/firestore` | **378.7 Ko** | Incontournable tant qu'on garde les `onSnapshot` |
| `re2js` | **119.7 Ko** | **18 % du chunk.** Transitive de Firestore v12 (validation des regex). Grossière surprise : 120 Ko pour ça |
| `@firebase/auth` | 65.8 Ko | — |
| `@firebase/webchannel-wrapper` | 65.1 Ko | Transport du temps réel : **devient inutile si on passe en lectures uniques** (phase 1) |
| `@firebase/messaging` | 15.2 Ko | Forcé dans ce chunk par `vite.config.ts:30`, alors qu'il ne sert qu'après login |
| `@firebase/util` / `installations` / `app` | 25.6 Ko | — |

`firebase/storage` est aussi listé dans `manualChunks` (`vite.config.ts:30`) :
aucune trace de `firebasestorage.googleapis.com` dans le bundle → il n'est en fait
pas embarqué, mais la ligne est trompeuse et coûteuse à relire. À nettoyer.

### 2.3 Chaîne de chargement réelle (lecture de code, pas des suppositions)

`AuthContext.tsx:70-99` enchaîne **séquentiellement** avant que `rolesReady` passe
à `true` — et `useJobs` ne s'abonne qu'ensuite (`useJobs.ts:69`, `if (!adminReady) return;`) :

| # | Étape | Coût réseau | Bloque l'affichage des missions ? |
| --- | --- | --- | --- |
| 1 | `getIdToken(u, /* forceRefresh */ true)` (`:73`) | 1 aller-retour `securetoken.googleapis.com`, cache volontairement court-circuité | oui |
| 2 | `await setDoc(users/{uid}, …, { merge })` (`:84`) | 1 **écriture** Firestore | oui |
| 3 | `await import('firebase/firestore')` puis `await getDoc(users/{uid})` (`:92`) | 1 `import` dynamique d'un module **déjà dans le bundle** + 1 lecture | oui |
| 4 | Initialisation FCM / service worker (`:102+`) | plusieurs | non, mais repousse la fin de chargement |

Puis, une fois `adminReady` : `subscribeToJobs` (1 aller-retour) → callback → les
abonnements par mission (§2.4). **Le premier contenu utile des missions est donc
derrière 4 allers-retours séquentiels + 2 avant d'afficher quoi que ce soit.**
C'est la cause n°1 de la lenteur perçue, et elle est indépendante du réseau.

### 2.4 N+1 et fuite d'abonnements sur la page Missions

`useJobs.ts:69-135`, pour **chaque** mission retournée :

- `subscribeToApplications(job.id)` → `onSnapshot(jobs/{id}/applications)` (`jobs.service.ts:295`)
- si connecté : `subscribeToUserApplication(job.id, uid)` (`jobs.service.ts:310`)

Soit, pour *N* missions avec un utilisateur connecté : **1 + 3N abonnements**
(12 missions ⇒ 37). Sans connexion : **1 + 2N**, dont **N refusés par les règles**
(`firestore.rules`, `jobs/{jobId}/applications/{appId}` exige `isSignedIn()`) :
sur une visite anonyme, chaque mission déclenche un aller-retour qui échoue en
`permission-denied`, et le SDK réessaie en backoff.

**Fuite visible à la lecture** — `jobs.service.ts:310-331` :

```ts
const unsubApp = onSnapshot(doc(`jobs/${jobId}/applications/${userId}`), (docSnap) => {
  onSnapshot(doc('jobApplications', `${jobId}_${userId}`), …);   // ← désabonneurs JAMAIS gardés
});
return unsubApp;   // ne coupe que l'abonnement extérieur
```

Chaque émission de l'abonnement extérieur crée un **nouvel** abonnement intérieur
dont le `Unsubscribe` est jeté. À chaque mise à jour temps réel d'une candidature,
un abonnement reste vivant jusqu'à la fin de session. C'est `window.__probe`
(`created` vs `active`) et l'échantillon de tas mémoire qui doivent le prouver.

### 2.5 Autres gaspillages visibles sans Lighthouse

| Constat | Fichier | Impact |
| --- | --- | --- |
| `@import url('fonts.googleapis.com/…')` **en tête** de la feuille de styles — vérifié : il est **encore là** dans le CSS livré (`dist/assets/index-*.css` commence par `@import"https://fonts.googleapis.com/…"`) | `src/index.css:1`, `index.html` | CSS externe bloquant le rendu, 2 origines sans `preconnect` (`index.html` n'a aucun `preconnect`) → retarde FCP et LCP |
| Chaîne Tailwind métissée, **vérifiée dans le CSS compilé** : pipeline v4 (`tailwindcss@4.1` + `@tailwindcss/postcss`) mais `index.css:3-5` en directives v3 → **aucun preflight émis** (ni `border-width:0`, ni `-webkit-text-size-adjust` dans le CSS livré) et `tailwind.config.js` **jamais lu** (v4 exige `@config` ou du CSS-first) | `index.css:3-5`, `tailwind.config.js`, `postcss.config.js` | Aucun reset/normalisation navigateur en production → petits écarts de rendu entre navigateurs et entre composants ; `theme.extend`/plugins du config ignorés. Sans lien avec le thème sombre : le code n'utilise **aucune** classe `dark:` (thème géré par `[data-theme="dark"]`) |
| `src/dev/diagnostics.ts` = 6.0 Ko dans le chunk `index` de prod | `src/main.tsx:9` | Prix de la mesure : acceptable en phase 0, à retirer en phase 4 |
| `HackedScreen.tsx` (4.3 Ko) dans le chunk de démarrage | `src/components/HackedScreen.tsx` | Marginal ; à passer en lazy si conservé |
| **`public/pionniers.png` = 177 Ko sert de favicon ET d'`apple-touch-icon`** | `index.html:6,10` | Téléchargé sur **chaque** visite (173 Ko transférés, mesurés par Lighthouse) : un favicon devrait peser 3-5 Ko. Le logo affiché dans l'app est le même fichier |
| `public/pis.png` 63 Ko affiché en petit | `index.html` / composants | Lighthouse : 45 Ko économisables en format moderne + 55 Ko en dimensions adaptées |
| **GIF de `public/` : `giphy.gif` 1.89 Mo, `skull.gif` 677 Ko, `hacked.gif` 652 Ko** | `Frontend/public/` | 3.2 Mo sur les écrans qui les affichent. En 4G simulée, c'est le double du poids de tout le JavaScript. Conversion en MP4 ou WebP animé : division par 5 à 10 |
| Tiers chargés dès l'accueil : `__/auth/iframe.js` (93 Ko) + `apis.google.com/gapi` (34 Ko) | Firebase Auth + fournisseur Google | 127 Ko de tiers avant même la connexion. À vérifier : le login Google est-il utilisé sur la page d'accueil, ou seulement sur `/login` ? |

### 2.6 Lighthouse sur la page d'accueil publique (mesuré, `npm run audit:local`)

| Métrique | Mobile (4G simulée, CPU ×4) | Desktop (10 Mb/s) |
| --- | --- | --- |
| **Score performance** | **72 / 100** | 98 / 100 |
| FCP (premier contenu) | 2.9 s | 0.6 s |
| **LCP (gros contenu)** | **6.9 s** | 0.9 s |
| TTI (interactif) | 6.9 s | 0.9 s |
| Total Blocking Time | 0 ms | 0 ms |
| CLS | 0 | 0.064 |
| Requêtes | 20 | 14 |
| **Poids transféré** | **0.71 Mo** | 0.58 Mo |

Poids par type, mobile : Script 437 Ko · Tiers 184 Ko · Other 175 Ko (= `pionniers.png`
chargé comme favicon) · Image 62 Ko · Polices 49 Ko · CSS 7 Ko · Document 2 Ko.

Plus grosses réponses (mobile) : `firebase-vendor` 201 Ko · **`pionniers.png` 173 Ko** ·
`auth/iframe.js` 93 Ko (tiers) · `index` 67 Ko · **`pis.png` 62 Ko** · `gapi` 34 Ko ·
`react-vendor` 34 Ko.

Gaspillages annoncés par Lighthouse : ressources bloquant le rendu **150 ms**
(polices Google + `index.css`) · JavaScript inutilisé **2200 ms** (`firebase-vendor`,
`index`) · `preconnect` manquants **333 ms** · `pis.png` 45 Ko (format) + 55 Ko (dimensions).

**Lecture de ces chiffres.** Le score desktop est excellent parce que l'accueil ne
demande presque aucun calcul : **tout l'écart mobile vient du volume transféré**
(0.71 Mo bridé à 1,6 Mb/s) — d'où un LCP à 6.9 s alors que le TBT est à 0 ms. Deux
conséquences pour la suite : (1) la priorité est le **poids**, pas le CPU ;
(2) les deux PNG non optimisés pèsent à eux seuls 235 Ko, soit **le tiers du poids
mobile**, pour un correctif sans aucun risque fonctionnel.

### 2.7 Sonde runtime sur le serveur de dev (mesuré, `npm run probe:runtime`)

Capture automatique (Chrome headless, visiteur **anonyme**, 9 s après le chargement,
sans bridage réseau) :

| Ce que la sonde a vu | Valeur |
| --- | --- |
| TTFB / FCP / LCP | 15 ms / 252 ms / 604 ms |
| Gels du thread (long tasks) | 0 |
| **Requêtes Firestore** | **0** (0 octet) |
| **Requêtes d'authentification** | **0** |
| Requêtes de ressources | JS 38 fich. / 3.85 Mo · CSS 643 o · image 63 Ko · police 1.1 Ko · autre 178 Ko |
| Plus gros fichiers | `firebase/firestore` 1.14 Mo · `react-dom/client` 1.01 Mo · `react-router-dom` 469 Ko · `firebase/auth` 277 Ko · `pionniers.png` 178 Ko |
| Abonnements Firestore | créés 0 · libérés 0 · **actifs 0** |
| Tas mémoire JS | 9.71 Mo |

**Trois enseignements, aucunement visibles dans Lighthouse :**

1. **Un visiteur anonyme ne déclenche strictement aucun appel Firebase** (ni Firestore,
   ni `identitytoolkit`, ni `securetoken`). La chaîne d'authentification en cascade
   décrite en §2.3 ne se paie donc **qu'au moment de la connexion** — c'est le
   « ressenti » des meneurs, pas la visite du public. Sa mesure exige une session :
   à relever avec `?diag=badge` après connexion (elle n'est pas reproductible ici).
2. Le badge de poids confirme le §2.5 : `pionniers.png` (178 Ko) est bien chargé depuis
   `index.html` comme **favicon** (type « other », jamais affiché en grand).
3. Les 3.85 Mo de JS sont un chiffre **de dev** : non minifié, pré-bundlé par Vite, et
   avec 291 Ko de HMR (`@vite/client` 179 Ko + `@react-refresh` 112 Ko) qui
   n'existent pas en production. À ne comparer **qu'entre deux mesures dev** ; le
   chiffre officiel du poids reste celui de `npm run bundle` (997 Ko / 304 Ko gzip).

> Le tas mémoire n'est mesuré qu'avec le drapeau Chrome `--enable-precise-memory-info`
> (déjà passé par `runtime-probe.mjs`). Sans lui, `performance.memory` vaut `null`.
> En dev, `StrictMode` monte aussi le compteur d'abonnements : chiffre officiel =
> `npm run build && npm run preview` puis `?diag=badge`.

### 2.8 Objectifs chiffrés proposés (à valider ensemble)

| Métrique | Avant | Cible |
| --- | --- | --- |
| JS du premier rendu | 997 Ko / 304 Ko gzip | **≤ 600 Ko / ≤ 190 Ko gzip** |
| Allers-retours avant la 1ʳᵉ donnée des missions | 4 séquentiels + 2 | **0 séquentiel, ≤ 2 parallèles** |
| Abonnements Firestore (12 missions, connecté) | 37 | **≤ 4** |
| Abonnements actifs après 3 allers-retours Dashboard↔Missions | à mesurer | **retour à la valeur initiale** |
| Gels cumulés sur la page missions | à mesurer (badge) | **< 200 ms** |
| LCP mobile (accueil) | **6.9 s** | **≤ 2.5 s** |
| Poids transféré mobile (accueil) | 0.71 Mo | **≤ 0.35 Mo** |
| Score Lighthouse mobile | 72/100 | **≥ 92/100** |

---

## 3. Plan des phases

Chaque phase se termine par : **(a)** la commande de mesure qui prouve le gain,
**(b)** une ligne dans le [journal](#journal-des-mesures), **(c)** aucune régression
fonctionnelle vérifiée à la main. Ordre choisi : d'abord ce qui coûte le plus en
temps perçu pour le moins de risque, et ce qui rend les mesures suivantes fiables.

### Phase 1 — Perçu immédiat, zéro changement de design *(à faire en premier)*

| # | Action | Fichiers | Preuve de réussite |
| --- | --- | --- | --- |
| 1.1 | **Casser la cascade d'authentification** : `getIdToken` **sans** `forceRefresh` ; ne pas `await` le `setDoc` d'upsert (fire-and-forget + `catch`) ; importer `getDoc` statiquement au lieu d'un `import()` d'un module déjà chargé ; ne pas attendre l'init FCM pour rendre | `AuthContext.tsx:73,84,92,102+` | Badge : `1ʳᵉ req Firestore` et `phases[rolesReady]` en forte baisse ; `__diag.report().firstAuthRpcAt` inchangé |
| 1.2 | **Boucher la fuite d'abonnements** : conserver et combiner les deux `Unsubscribe`, créer l'abonnement intérieur **une seule fois** hors du callback | `jobs.service.ts:310-331` | `__probe.active` revient à sa valeur de base après 3 allers-retours ; tas mémoire plat sur 5 échantillons |
| 1.3 | **Supprimer le N+1** : 1 abonnement `jobApplications` filtré sur `userId == uid` pour « mes statuts » (1 doc lu, pas 2N) ; comptage des candidatures à la demande (`getCountFromServer`, `limit`) plutôt qu'abonné par mission | `useJobs.ts:69-135`, `jobs.service.ts:295` | `__probe.created` ≈ 2-3 sur la page missions (au lieu de 1+3N) ; badge « Firestore req » en baisse |
| 1.4 | **Polices** : supprimer l'`@import` de tête (bloquant), auto-héberger les 2 woff2 Manrope/Sora ou à défaut `preconnect` + `font-display: swap` | `index.css:1`, `index.html`, `public/fonts/` | Les 150 ms de ressources bloquantes → 0 ; FCP mobile en baisse ; plus de requête bloquante vers `fonts.googleapis.com` |
| 1.5 | **Ne pas s'abonner à ce qu'on n'a pas le droit de lire** : garde `isSignedIn()` côté client avant `subscribeToApplications` | `useJobs.ts`, `jobs.service.ts` | Plus de `permission-denied` en visite anonyme ; `rpc["firestore:Listen"]` propre |
| 1.6 | **Alléger les médias du premier rendu** : `pionniers.png` (177 Ko, utilisé comme favicon + logo) → 64×64 WebP/AVIF (~4 Ko) ; `pis.png` (63 Ko) → format moderne et dimensions réelles ; ajouter les `preconnect` (`fonts.gstatic.com`, `apis.google.com`) dans `index.html` | `index.html`, `public/` | **≈ 230 Ko de moins** sur mobile ; LCP 6.9 s attendu sous 3 s |

**Risque / retour arrière** : 1.1 change l'ordre dans lequel le rôle admin est
connu — vérifier les écrans qui lisent `isAdmin` au 1ᵉʳ rendu (ils doivent
tolérer `rolesReady === false`). 1.3 remplace du temps réel par du quasi temps
réel : à valider avec toi (les compteurs de candidats ne s'actualiseront plus
tout seuls). Chaque sous-action = commit séparé, donc annulable indépendamment.

### Phase 2 — Fiabilité des données et coût Firestore

| # | Action | Détail |
| --- | --- | --- |
| 2.1 | Index composés | `jobApplications` : `(userId, status)` ; `applications` : `(jobId)` — à créer dans la console, sinon les nouvelles requêtes échouent en silencieux |
| 2.2 | Cache local persistant | `initializeFirestore(..., { localCache: persistentLocalCache() })` → revisite quasi instantanée (à mesurer au badge, 2ᵉ visite) |
| 2.3 | Pagination / `limit` | Liste des missions : `limit(20)` + « charger plus » ; historique : idem |
| 2.4 | Erreurs visibles | Les `onSnapshot(error)` doivent remonter un état à l'UI, pas seulement `console.error` |
| 2.5 | Règles | Aligner `firestore.rules` sur le nouveau schéma d'accès (les anonymes ne doivent plus cibler `applications`) |

### Phase 3 — Poids du bundle (le chiffre « 997 Ko »)

| # | Action | Gain attendu | Comment le vérifier |
| --- | --- | --- | --- |
| 3.1 | `manualChunks` en **fonction** (ou `output.advancedChunks`) : `{react, react-dom, scheduler}` réellement ensemble, `react-router` séparé, sortir `firebase/messaging` du vendor | lisibilité + cache ; ~15 Ko | `npm run bundle` : plus de `react-dom` dans le chunk `index` |
| 3.2 | **Shell de démarrage** : l'initialisation Firebase derrière un `import()` dynamique, avec un squelette HTML/CSS dans `index.html` | le premier pixel n'attend plus 300 Ko gzip de JS ; **FCP** | `__diag` : FCP vs `phases[mounted]` ; Lighthouse mobile |
| 3.3 | `re2js` (120 Ko) : vérifier s'il est réellement atteignable dans notre usage de Firestore ; si oui, envisager un alias/`external` **uniquement avec test de non-régression**, sinon remonter en amont | jusqu'à 120 Ko | `npm run bundle` : chunk firebase |
| 3.4 | FullCalendar : ne charger que les plugins vraiment utilisés par la route Calendrier (261 Ko quand même) | 60-120 Ko sur la route | `npm run bundle -- --contains=calendar` |
| 3.5 | Médias : les GIF mesurés de `public/` — `giphy.gif` 1.89 Mo, `skull.gif` 677 Ko, `hacked.gif` 652 Ko (3.2 Mo à eux trois) → MP4/WebP animé ou `loading="lazy"` hors premier écran ; `pionniers.png` → AVIF/WebP + dimensions fixes | LCP et données mobiles | Lighthouse « Serve assets in modern formats » |

### Phase 4 — Finir propre (après les gains)

1. **Reprendre la chaîne CSS** : passer `index.css` en syntaxe v4 (`@import "tailwindcss";`),
   supprimer ou brancher réellement `tailwind.config.js`, et rétablir le
   **preflight** (activement absent du CSS livré, voir §2.5). C'est le seul point
   qui peut changer le rendu : à faire **après** les gains, écran par écran.
2. Polices auto-hébergées (2 woff2 + `font-display: swap` + `preconnect`).
3. Retirer la sonde du build de production (`src/dev/*` + l'appel dans `main.tsx`)
   — ou la garder derrière un flag de build, au choix.
4. Garde-fou CI : `npm run build:sourcemap && npm run bundle` comparé au seuil
   consigné ici (ex. échouer si le premier rendu repasse > 650 Ko).

---

## 4. Protocole de re-mesure (à répéter à chaque phase)

```bash
cd Frontend
npm run audit -- --local --form=mobile --label=phase1-apres   # build + preview + Lighthouse
npm run probe:runtime                            # socle runtime anonyme, sans navigateur
npm run build:sourcemap && npm run bundle        # poids du premier rendu
npm run preview -- --port 4173                   # puis navigateur : http://localhost:4173/?diag=badge
#   1. Accueil → noter FCP / LCP / Firestore req
#   2. Connexion → noter « 1ʳᵉ req Firestore » et « 1ʳᵉ req Auth »
#   3. Missions → noter « Abonnements »
#   4. 3 allers-retours Dashboard ↔ Missions → « Abonnements » doit REDescendre
#   5. window.__diag.copy() + JSON.stringify(window.__probe) → coller ici
```

> `npm run audit` démarre **son propre** serveur de preview sur le port 4173 et le
> relance en fin de course : ne pas laisser un `npm run preview` tourner à côté
> (le port est réservé en `--strictPort`). D'où l'ordre ci-dessus : audit d'abord,
> preview manuel ensuite pour la passe au badge.
> `window.__probe` est un simple objet de compteurs (pas de méthode `report()`).

---

## Journal des mesures

<!-- scripts/audit.mjs écrit ses lignes Lighthouse ici automatiquement -->

| Date | Build | Forme | Score | FCP | LCP | TBT | CLS | JS 1ᵉʳ rendu | Abonnements (missions) | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 28/09/2026 | `f6a3755` | **mobile** | **72/100** | 2.9 s | **6.9 s** | 0 ms | 0 | 997 Ko / 304 Ko gzip (0.71 Mo transféré) | 1+3N (fuite attendue) | `phase0-avant` |
| 28/09/2026 | `f6a3755` | desktop | 98/100 | 0.6 s | 0.9 s | 0 ms | 0.064 | idem (0.58 Mo transféré) | idem | `phase0-avant` |
| 30/09/2026 | non commité | **mobile** | **77/100** | 2.8 s | **4.6 s** | 0 ms | 0.098 | 960 Ko / 293 Ko gzip (0.53 Mo transféré) | à mesurer au badge | `phase1-final` |
| 30/09/2026 | non commité | desktop | 99/100 | 0.6 s | 0.7 s | 0 ms | 0.054 | idem (0.40 Mo transféré) | idem | `phase1-final` |



---

## Mesure `phase0-avant` — 2026-09-28T22-02-42 (2026-09-28 22:02 UTC)

### mobile — score 72/100 · http://localhost:4173/

| Métrique | Valeur |
| --- | --- |
| FCP | 2.9 s |
| LCP | 6.9 s |
| Speed Index | 2.9 s |
| TTI | 6.9 s |
| Total Blocking Time | 0 ms |
| CLS | 0 |
| **Requêtes** | **20** |
| **Poids transféré** | **0.71 Mo** |

<details><summary>Poids par type de ressource</summary>

| Type | Requêtes | Transféré |
| --- | --- | --- |
| Script | 7 | 437 Ko |
| Other | 5 | 175 Ko |
| Image | 1 | 62 Ko |
| Font | 2 | 49 Ko |
| Stylesheet | 3 | 7 Ko |
| Document | 2 | 2 Ko |
| Media | 0 | 0 Ko |
| Third-party | 9 | 184 Ko |

</details>

<details><summary>Plus grosses réponses (&gt;30 Ko)</summary>

| Ressource | Transféré |
| --- | --- |
| localhost:4173/assets/firebase-vendor-B3w7Jvrz.js | 201 Ko |
| localhost:4173/pionniers.png | 173 Ko |
| pionniers-26-a4449.firebaseapp.com/__/auth/iframe.js | 93 Ko |
| localhost:4173/assets/index-UjdfEfhP.js | 67 Ko |
| localhost:4173/pis.png | 62 Ko |
| apis.google.com/_/scs/abc-static/_/js/k=gapi.lb.en.zhTT8Br0H | 34 Ko |
| localhost:4173/assets/react-vendor-B7hlnVXy.js | 34 Ko |

</details>

**Gaspillages repérés par Lighthouse**

| Audit | Occurrences | Économie estimée | Exemples |
| --- | --- | --- | --- |
| Ressources bloquant le rendu | 2 | 150 ms | fonts.googleapis.com/css2?family=Manrope:wght@400;50 · localhost:4173/assets/index-DFEY5Qaw.css |
| JavaScript inutilisé | 3 | 2200 ms | localhost:4173/assets/firebase-vendor-B3w7Jvrz.js · localhost:4173/assets/index-UjdfEfhP.js |
| Images en format moderne | 1 | 45 Ko | localhost:4173/pis.png |
| Preconnect manquants | 3 | 333 ms | pionniers-26-a4449.firebaseapp.com · apis.google.com |
| Images sur-dimensionnées | 1 | 55 Ko | localhost:4173/pis.png |
| Tiers | 3 | – | – |

### desktop — score 98/100 · http://localhost:4173/

| Métrique | Valeur |
| --- | --- |
| FCP | 0.6 s |
| LCP | 0.9 s |
| Speed Index | 0.6 s |
| TTI | 0.9 s |
| Total Blocking Time | 0 ms |
| CLS | 0.064 |
| **Requêtes** | **14** |
| **Poids transféré** | **0.58 Mo** |

<details><summary>Poids par type de ressource</summary>

| Type | Requêtes | Transféré |
| --- | --- | --- |
| Script | 4 | 304 Ko |
| Other | 3 | 174 Ko |
| Image | 1 | 62 Ko |
| Font | 2 | 49 Ko |
| Stylesheet | 3 | 7 Ko |
| Document | 1 | 1 Ko |
| Media | 0 | 0 Ko |
| Third-party | 3 | 51 Ko |

</details>

<details><summary>Plus grosses réponses (&gt;30 Ko)</summary>

| Ressource | Transféré |
| --- | --- |
| localhost:4173/assets/firebase-vendor-B3w7Jvrz.js | 201 Ko |
| localhost:4173/pionniers.png | 173 Ko |
| localhost:4173/assets/index-UjdfEfhP.js | 67 Ko |
| localhost:4173/pis.png | 62 Ko |
| localhost:4173/assets/react-vendor-B7hlnVXy.js | 34 Ko |

</details>

**Gaspillages repérés par Lighthouse**

| Audit | Occurrences | Économie estimée | Exemples |
| --- | --- | --- | --- |
| Ressources bloquant le rendu | 1 | 80 ms | fonts.googleapis.com/css2?family=Manrope:wght@400;50 |
| JavaScript inutilisé | 3 | 70 ms | localhost:4173/assets/firebase-vendor-B3w7Jvrz.js · localhost:4173/assets/index-UjdfEfhP.js |
| Images en format moderne | 1 | 40 ms | localhost:4173/pis.png |
| Preconnect manquants | 1 | 136 ms | fonts.gstatic.com |
| Images sur-dimensionnées | 1 | 40 ms | localhost:4173/pis.png |
| Tiers | 1 | – | – |

> Rapports HTML complets: `Frontend/audits/lh-2026-09-28T22-02-42-*.report.html`


---

## Mesure `phase1-final` — 2026-09-30T09-44-38 (2026-09-30 09:44 UTC)

### mobile — score 77/100 · http://localhost:4173/

| Métrique | Valeur |
| --- | --- |
| FCP | 2.8 s |
| LCP | 4.6 s |
| Speed Index | 2.8 s |
| TTI | 4.6 s |
| Total Blocking Time | 0 ms |
| CLS | 0.098 |
| **Requêtes** | **21** |
| **Poids transféré** | **0.53 Mo** |

<details><summary>Poids par type de ressource</summary>

| Type | Requêtes | Transféré |
| --- | --- | --- |
| Script | 8 | 430 Ko |
| Font | 2 | 50 Ko |
| Other | 5 | 39 Ko |
| Image | 1 | 17 Ko |
| Stylesheet | 3 | 7 Ko |
| Document | 2 | 2 Ko |
| Media | 0 | 0 Ko |
| Third-party | 6 | 134 Ko |

</details>

<details><summary>Plus grosses réponses (&gt;30 Ko)</summary>

| Ressource | Transféré |
| --- | --- |
| localhost:4173/assets/firebase-vendor-DT_j4Ib6.js | 196 Ko |
| pionniers-26-a4449.firebaseapp.com/__/auth/iframe.js | 93 Ko |
| localhost:4173/assets/react-vendor-dqXCn9_H.js | 59 Ko |
| apis.google.com/_/scs/abc-static/_/js/k=gapi.lb.en.gh7qIZtzO | 34 Ko |
| localhost:4173/assets/router-vendor-FwiH6NjW.js | 30 Ko |

</details>

**Gaspillages repérés par Lighthouse**

| Audit | Occurrences | Économie estimée | Exemples |
| --- | --- | --- | --- |
| Ressources bloquant le rendu | 2 | 150 ms | localhost:4173/assets/index-DJyPARJp.css · localhost:4173/fonts/fonts.css |
| JavaScript inutilisé | 3 | 1340 ms | localhost:4173/assets/firebase-vendor-DT_j4Ib6.js · localhost:4173/assets/router-vendor-FwiH6NjW.js |
| Preconnect manquants | 1 | 128 ms | apis.google.com |
| Tiers | 2 | – | – |

### desktop — score 99/100 · http://localhost:4173/

| Métrique | Valeur |
| --- | --- |
| FCP | 0.6 s |
| LCP | 0.7 s |
| Speed Index | 0.6 s |
| TTI | 0.7 s |
| Total Blocking Time | 0 ms |
| CLS | 0.054 |
| **Requêtes** | **15** |
| **Poids transféré** | **0.40 Mo** |

<details><summary>Poids par type de ressource</summary>

| Type | Requêtes | Transféré |
| --- | --- | --- |
| Script | 5 | 297 Ko |
| Font | 2 | 50 Ko |
| Other | 3 | 38 Ko |
| Image | 1 | 17 Ko |
| Stylesheet | 3 | 7 Ko |
| Document | 1 | 1 Ko |
| Media | 0 | 0 Ko |
| Third-party | 0 | 0 Ko |

</details>

<details><summary>Plus grosses réponses (&gt;30 Ko)</summary>

| Ressource | Transféré |
| --- | --- |
| localhost:4173/assets/firebase-vendor-DT_j4Ib6.js | 196 Ko |
| localhost:4173/assets/react-vendor-dqXCn9_H.js | 59 Ko |
| localhost:4173/assets/router-vendor-FwiH6NjW.js | 30 Ko |

</details>

**Gaspillages repérés par Lighthouse**

| Audit | Occurrences | Économie estimée | Exemples |
| --- | --- | --- | --- |
| Ressources bloquant le rendu | 1 | 40 ms | localhost:4173/assets/index-DJyPARJp.css |
| JavaScript inutilisé | 3 | 200 ms | localhost:4173/assets/firebase-vendor-DT_j4Ib6.js · localhost:4173/assets/router-vendor-FwiH6NjW.js |
| Images sur-dimensionnées | 1 | 10 ms | localhost:4173/pis.webp |

> Rapports HTML complets: `Frontend/audits/lh-2026-09-30T09-44-38-*.report.html`

---

## Bilan Phase 1 — 30/09/2026 (`phase0-avant` → `phase1-final`)

Même protocole que §4 : `npm run audit:local` (build de production servi par le
preview, course Lighthouse fraîche, deux formes) + `npm run bundle`.
Rapports détaillés : `Frontend/audits/lh-2026-09-30T09-44-38-*.report.html`.

### Avant / après

| | mobile avant | mobile après | desktop avant | desktop après |
| --- | --- | --- | --- | --- |
| Score | 72 | **77** | 98 | **99** |
| LCP | 6.9 s | **4.6 s** | 0.9 s | **0.7 s** |
| TTI | 6.9 s | **4.6 s** | 0.9 s | **0.7 s** |
| FCP / TBT | 2.9 s / 0 ms | 2.8 s / 0 ms | 0.6 s / 0 ms | 0.6 s / 0 ms |
| CLS | 0 | 0.098 (instable, voir ouvertures) | 0.064 | 0.054 |
| Requêtes | 20 | 21 | 14 | 15 |
| Poids transféré | 0.71 Mo | **0.53 Mo (−25 %)** | 0.58 Mo | **0.40 Mo (−31 %)** |
| JS 1ᵉʳ rendu (`npm run bundle`) | 997 Ko / 304 Ko gz | 960 Ko / 293 Ko gz | idem | idem |
| Requêtes tierces | 9 — 184 Ko | **6 — 134 Ko** | 3 — 51 Ko | **0 Ko** |
| Polices | 2 requêtes vers Google Fonts | **0** : 8 woff2 auto-hébergés (110 Ko), 2 servus (50 Ko) | idem | idem |
| Images lourdes listées | `pionniers.png` 173 Ko + `pis.png` 62 Ko | **aucune > 30 Ko** | idem | aucune > 30 Ko |

> Course intermédiaire du 30/09 09:09 (modifs de code en place, polices et images
> encore d'origine — rapports conservés dans `Frontend/audits/`) : LCP 5,7 s,
> 0,72 Mo. Le saut final vient donc bien des polices auto-hébergées et des images
> optimisées, en plus du travail de code.

### Ce qui a changé (aucun changement de comportement visible)

1. **Démarrage Auth** (`AuthContext.tsx`) : cascade séquentielle supprimée —
   l'identité s'affiche immédiatement, `getIdToken()` (sans force-refresh) et
   l'upsert `setDoc` sont résolus en arrière-plan ; seul l'`getDoc` du rôle attendu
   pour `rolesReady` est bloquant. `firebase/messaging` importé à la demande.
2. **Abonnements Firestore** (`useJobs.ts`, `jobs.service.ts`) : abonnements de la
   liste découplés des abonnements par mission, limités aux missions **à venir**
   (prédicat partagé `isUpcomingJob` dans `date.utils.ts`), ignorés pour les
   visiteurs anonymes ; fuite de `subscribeToUserApplication` corrigée (les deux
   `onSnapshot` sont désormais désabonnés).
3. **Cache hors ligne** (`firebase/config.ts`) : `persistentLocalCache` +
   `persistentMultipleTabManager`.
4. **HistoryPage** : boucle `getDocs` séquentielle → lots parallèles de 8.
5. **Rendu** : mesure d'en-tête rAF-throttled (Layout), survol de `JobCard` en CSS
   (`@media (hover:hover)`) au lieu de mutations JS, mémoïsation sur signature des
   champs affichés, `applyLoading` global remplacé par `isApplying` par carte.
6. **Bundle** (`vite.config.ts`) : `manualChunks` en **fonction** — la forme
   objet forçait Rollup à embarquer `firebase/storage` ; `firebase/messaging`
   isolé (18,5 Ko, lazy) ; `HackedScreen` en `lazy` (chunk dédié 6,6 Ko — ses
   3,2 Mo de GIF ne sont de toute façon téléchargés que si l'écran est activé).
7. **Polices** : `scripts/selfhost-fonts.mjs` télécharge les woff2 et génère
   `public/fonts/fonts.css` ; `index.html` charge cette feuille et **précharge les
   2 sous-ensembles « latin »** (Manrope + Sora) qui couvrent le texte français.
   Disparition des connexions `fonts.googleapis.com` / `fonts.gstatic.com`.
8. **Images** : `scripts/optimize-images.mjs` (Chrome headless) → icônes
   192/512 px pour le manifest, `pis.webp` à 128 px de haut pour le `<picture>` du
   Header, favicon AVIF ; `pionniers.png` (177 Ko, plus référencé) déplacé vers
   `assets-src/` (non déployé) ; `logo-pionnier.webp` (44 Ko, jamais référencé)
   supprimé.
9. **Tailwind v4** : `index.css` en syntaxe v4 (`@import "tailwindcss/theme.css"`
   + `utilities.css`, `@source`, **sans preflight** pour ne pas bouleverser les
   ~700 lignes de CSS maison) ; `tailwind.config.js` (ignoré par la v4) supprimé.

### Vérifications passées

- `npm run build` (inclut `tsc -b`) ✓ · `npm run lint` ✓ · `npx tsc --noEmit` ✓
- `npm run check:css` (nouveau garde-fou) : 24 classes utilitaires présentes dans
  le CSS compilé, 36 `@font-face`, aucune référence Google Fonts dans `dist/` ✓
- Chunks : `firebase-messaging` (18,5 Ko) et `HackedScreen` (6,6 Ko) séparés,
  `calendar-vendor` (261,6 Ko) confirmé lazy ✓
- Lighthouse : mobile **77**, desktop **99** (détail ci-dessus) ✓

### Points ouverts

- **CLS instable** : 0 ou 0.098 selon la course — à stabiliser (dimensions
  réservées pour le logo du Header, comportement des polices au swap).
- **JS 1ᵉʳ rendu** : 960 Ko / 293 Ko gz, cible §2.8 = ≤ 600 Ko / 190 Ko → reste
  Phase 3 (`firebase-vendor` 660 Ko, `re2js`, FullCalendar).
- **`apis.google.com` (gapi, 34 Ko)** : dernier tiers notable — à charger
  à l'ouverture de la vue de connexion si le compte Google est réellement utilisé.
- Passe manuelle du badge `?diag=badge` (étapes 1-5 du §4) non faite cette
  session : les compteurs d'abonnements missions sont donc « à mesurer ».
- Phase 4 (unification du style) non commencée : styles en ligne de `JobCard` et
  les ~700 lignes de CSS maison restent à migrer vers tokens/utilitaires.

