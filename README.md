# Overlay OBS — LordHurTV

Barre d'overlay interactive pour OBS Studio : pseudo du streamer, **dernier follower**, **dernier sub / subgift** (avec le nom du donateur), **dernier donateur de bits ou don d'argent**, objectif de subs et horloge.

Le fond de la barre est translucide avec un flou (`backdrop-filter`) pour bien se détacher de l'image du stream, et chaque nouvel événement déclenche une petite animation.

Tout se règle en direct depuis un **panneau de contrôle** web (pseudo, noms, montants, couleurs, opacité, flou, hauteur…).

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ▮▮▮ LORDHURTV │ ❤ DERNIER FOLLOWER │ ★ DERNIER SUB │ ◆ DERNIER BITS │ … │ 🕒 │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Sommaire

1. [Démarrage rapide](#1-démarrage-rapide)
2. [Ajout dans OBS Studio](#2-ajout-dans-obs-studio)
3. [Panneau de contrôle](#3-panneau-de-contrôle)
4. [Personnaliser](#4-personnaliser)
5. [Brancher les vrais événements](#5-brancher-les-vrais-événements)
6. [GitHub Pages](#6-github-pages)
7. [Synchronisation cloud Supabase (optionnel)](#7-synchronisation-cloud-supabase-optionnel)
8. [Paramètres d'URL](#8-paramètres-durl)
9. [Structure du projet](#9-structure-du-projet)
10. [FAQ / dépannage](#10-faq--dépannage)

---

## 1. Démarrage rapide

Prérequis : [Node.js 18+](https://nodejs.org) (aucune dépendance à installer).

```bash
git clone https://github.com/lordhur/overlay-Sub.git
cd overlay-Sub
npm start
```

Puis :

| Page | URL |
| --- | --- |
| Panneau de contrôle | <http://localhost:3000> |
| Overlay pour OBS | <http://localhost:3000/overlay.html> |
| Aperçu avec fond de démo | <http://localhost:3000/overlay.html?bg=game> |

Le serveur écoute sur `0.0.0.0` : tu peux aussi piloter le panneau depuis ton téléphone sur le réseau local (`http://192.168.x.x:3000`).

> `http://localhost:3000` ouvre le panneau dans un navigateur classique et **l'overlay** directement dans OBS (détection du User-Agent). Pour être sûr, utilise `/overlay.html` comme URL de source dans OBS — c'est cette URL que copie le bouton **« Copier l'URL OBS »**.

---

## 2. Ajout dans OBS Studio

1. Scène → **+** → **Navigateur** (Browser Source).
2. **URL** : `http://localhost:3000/overlay.html`
3. **Largeur** : `1920`, **Hauteur** : `1080` (ou la taille de ta scène).
4. Coche :
   - **Arrêter la source lorsque masquée** (économie de ressources),
   - **Rafraîchir le navigateur lorsque la scène devient active**.
5. Ne mets **aucune couleur de fond** dans les propriétés de la source : la page est transparente (le verre flouté laisse voir ton jeu derrière).
6. Si la barre ne bouge pas après une modification : clic droit sur la source → **Actualiser le cache de la page**.

> **À propos du flou** : un filtre CSS `backdrop-filter` ne peut flouter que le contenu HTML placé derrière la barre — dans OBS, la vidéo du jeu n'existe pas « dans » la page, donc le flou CSS ne s'applique pas au jeu (il est réellement visible dans l'aperçu du panneau et dans un navigateur). L'overlay compense avec un verre translucide + un grain givré réglable via le curseur **Flou du fond**.
>
> Pour un **vrai flou du jeu** derrière la barre (optionnel) :
> 1. Dans le panneau, choisis **Barre pleine largeur** (hauteur 64 px par exemple).
> 2. Dans OBS, duplique ta source de jeu (clic droit → **Dupliquer**), ajoute-lui le filtre **Mise à l'échelle / Recadrage** (« Crop/Pad ») pour ne garder que les 64 px du haut.
> 3. Ajoute le filtre **Flou** (rayon ~20) sur cette copie, puis place-la **au-dessus** du jeu et **en dessous** de la source navigateur.
>
> La barre étant pleine largeur, la bande floutée correspond exactement à son fond (seuls les deux petits triangles biseautés restent nets).

---

## 3. Panneau de contrôle

Ouvre <http://localhost:3000> (ou `control.html`). Tout ce que tu modifies s'applique **instantanément** dans l'aperçu et dans OBS.

- **Chaîne** : pseudo, affichage de l'horloge, des infos, secondes et date.
- **Dernier follower** : pseudo + bouton *Simuler*.
- **Dernier sub** : type **Sub** ou **Subgift**, pseudo, donateur, nombre offert, palier, mois.
  - Mode subgift → la barre affiche « DERNIER SUBGIFT » et « offert par … ».
- **Dernier bits / don** : type **Bits** ou **Don d'argent**, pseudo, quantité/montant, devise.
- **Objectif** : valeur actuelle, cible, libellé et barre de progression.
- **Simulations** : un clic pour tester chaque type d'événement, ou **mode démo automatique** (un événement fictif toutes les 6 secondes).
- **Apparence** : couleur d'accent, opacité du fond, flou, hauteur, barre pleine largeur ou ajustée à droite, animations, masquer les infos vides, majuscules.
- **Données** : export/import JSON, réinitialisation.

Les valeurs sont enregistrées dans le navigateur et dans `data/state.json` côté serveur : l'overlay retrouve son état après un redémarrage.

---

## 4. Personnaliser

### Via le panneau (recommandé)

Opacité, flou, hauteur, couleur, libellés d'événements, visibilité de chaque bloc, animations… Tout est sauvegardé.

### Via `js/config.js`

- `labels` : les textes (« Dernier follower », « Dernier subgift », …).
- `defaults` : les valeurs de démo au premier lancement, et le thème par défaut.
- `cloud` : la configuration Supabase (voir §7).

### Variables CSS

Dans `css/overlay.css`, la barre est pilotée par des variables :

```css
--accent      /* couleur orange */
--bar-rgb     /* couleur du verre */
--bar-opacity /* transparence (0 → 1) */
--blur        /* flou en px */
--bar-h       /* hauteur de la barre, tout le reste suit proportionnellement */
```

---

## 5. Brancher les vrais événements

### 5.1 Webhooks du serveur local

Le serveur expose une API simple. Pratique pour **Streamer.bot**, **Touch Portal**, **StreamElements**, un bot maison…

```bash
# Nouveau follower
curl "http://localhost:3000/api/event?type=follow&name=NouveauFollower"

# Nouveau sub / resub
curl "http://localhost:3000/api/event?type=sub&name=Pseudo&tier=Tier%202&months=3"

# Subgift (donateur + nombre de subs offerts)
curl "http://localhost:3000/api/event?type=subgift&name=Receveur&gifter=Donateur&count=5"

# Bits
curl "http://localhost:3000/api/event?type=bits&name=Pseudo&bits=500"

# Don d'argent
curl "http://localhost:3000/api/event?type=donation&name=Pseudo&amount=10&currency=EUR"

# Objectif
curl "http://localhost:3000/api/event?type=goal&current=158&target=170"
```

En `POST` JSON, si tu préfères :

```bash
curl -X POST http://localhost:3000/api/event \
  -H "Content-Type: application/json" \
  -d '{"type":"subgift","name":"Receveur","gifter":"Donateur","count":5}'
```

Champs acceptés : `type` (`follow`, `sub`, `subgift`, `bits`, `donation`, `goal`), `name`/`user`, `gifter`, `count`, `bits`, `amount`, `currency`, `tier`, `months`.

**Streamer.bot** : action → sous-action **HTTP Request** → méthode `GET` (ou `POST` JSON), URL :

```
http://127.0.0.1:3000/api/event?type=follow&name=%user%
```

**StreamElements / Streamlabs** : envoie l'événement depuis ton widget personnalisé ou ton bot avec `fetch("http://localhost:3000/api/event", {method:"POST", …})`.

### 5.2 Directement depuis OBS (sans panneau)

Ajoute un paramètre à l'URL de la source :

```
http://localhost:3000/overlay.html?name=LordHurTV&follower=Litchitchi&sub=Nymphidiel_&bits=500&cheerName=Miguel&goal=157/170
```

Ces paramètres écrasent l'état au chargement — pratique pour tester ou pour plusieurs overlays différents.

### 5.3 Sans serveur local

Deux solutions :

- **Supabase Realtime** (voir §7) pour contrôler l'overlay depuis n'importe où, y compris avec GitHub Pages.
- Depuis le panneau, les réglages restent dans **le navigateur** (le badge affiche « Mode local ») : OBS ne les verra pas, sauf si tu utilises `?follower=…` dans l'URL de la source.

---

## 6. GitHub Pages

Le dépôt contient un workflow `.github/workflows/pages.yml` qui publie le site à chaque push sur `main`.

1. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. Pousse sur `main` (ou lance le workflow manuellement depuis l'onglet **Actions**).
3. Les pages sont alors disponibles sur :

```
https://lordhur.github.io/overlay-Sub/          → panneau de contrôle
https://lordhur.github.io/overlay-Sub/control.html
https://lordhur.github.io/overlay-Sub/overlay.html  → à mettre dans OBS
```

> En hébergement statique il n'y a pas de serveur pour synchroniser OBS et le panneau : l'overlay affiche les valeurs de `defaults` (ou celles passées en paramètres d'URL). Pour un vrai pilotage à distance, active Supabase (§7). Pour un pilotage local simple, utilise `npm start`.

---

## 7. Synchronisation cloud Supabase (optionnel)

Permet de piloter l'overlay OBS depuis un autre appareil, y compris quand l'overlay est servi par GitHub Pages.

1. Crée un projet sur [supabase.com](https://supabase.com), puis exécute ce SQL dans l'éditeur SQL :

```sql
create table if not exists public.overlay_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.overlay_state enable row level security;

create policy "overlay_select" on public.overlay_state
  for select using (true);

create policy "overlay_insert" on public.overlay_state
  for insert with check (true);

create policy "overlay_update" on public.overlay_state
  for update using (true) with check (true);
```

2. Renseigne `js/config.js` :

```js
cloud: {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "eyJhbGciOi...", // clé publique "anon"
  channel: "lordhurtv-overlay",
  table: "overlay_state",
  rowId: "lordhurtv",
  persist: true,
},
```

3. Recharge l'overlay et le panneau : le badge du panneau passe en **« Synchro cloud active »**. `persist: true` garde l'état après un rechargement d'OBS.

> ⚠️ Les règles ci-dessus sont ouvertes en écriture avec la clé `anon` (pratique pour un overlay perso, mais n'importe qui ayant la clé pourrait modifier les données). Pour un usage sérieux, restreins les policies, ou utilise un serveur/une Edge Function avec authentification.

Sans table, `persist: false` utilise seulement le broadcast temps réel : l'overlay affiche son état par défaut après un rechargement.

---

## 8. Paramètres d'URL

| Paramètre | Exemple | Effet |
| --- | --- | --- |
| `name` | `?name=LordHurTV` | Pseudo affiché |
| `follower` | `?follower=Litchitchi` | Dernier follower |
| `sub` | `?sub=Nymphidiel_` | Dernier sub |
| `subgift` | `?subgift=Mystik` | Donateur (passe en subgift) |
| `bits` + `cheerName` | `?bits=500&cheerName=Miguel` | Dernier donateur de bits |
| `don` + `donName` | `?don=10&donName=Miguel&currency=EUR` | Dernier don d'argent |
| `goal` | `?goal=157/170` | Objectif (actuel/cible) |
| `goalLabel` | `?goalLabel=SUBS` | Libellé de l'objectif |
| `accent` | `?accent=%23F0610F` | Couleur d'accent |
| `opacity` | `?opacity=0.7` | Opacité du fond |
| `blur` | `?blur=14` | Flou du fond (px) |
| `height` | `?height=80` | Hauteur de la barre (px) |
| `mode` | `?mode=right` | Barre ajustée à droite |
| `hideEmpty` | `?hideEmpty=1` | Masque les infos vides |
| `noanim` | `?noanim=1` | Désactive les animations |
| `bg` | `?bg=game`, `checker`, `dark`, `light` | Fond de démo (hors OBS) |
| `demo` | `?demo=1` | Événements fictifs automatiques |
| `preview` | `?preview=1` | Utilisé par l'aperçu du panneau |

---

## 9. Structure du projet

```
overlay-Sub/
├── overlay.html            # overlay transparent à mettre dans OBS
├── control.html            # panneau de contrôle
├── index.html              # redirection vers le panneau (GitHub Pages)
├── js/
│   ├── config.js           # libellés, valeurs par défaut, config Supabase
│   ├── state.js            # état partagé + synchro (serveur, onglets, Supabase)
│   ├── overlay.js          # rendu de la barre (icônes, animations, horloge)
│   └── control.js          # logique du panneau
├── css/
│   ├── overlay.css         # design de la barre
│   └── control.css         # design du panneau
├── assets/
│   ├── fonts/              # polices embarquées (aucun CDN requis dans OBS)
│   ├── favicon.svg
│   └── preview-bg.jpg      # fond de démonstration pour l'aperçu
├── server.js               # serveur local (statique + API + SSE + webhooks)
├── data/state.json         # état persistant (créé automatiquement, ignoré par git)
└── .github/workflows/      # déploiement GitHub Pages
```

---

## 10. FAQ / dépannage

**Le fond n'est pas transparent dans OBS.**
Vérifie que tu utilises `overlay.html` (et non `control.html`) et qu'aucune couleur de fond n'est définie dans les propriétés de la source.

**Le flou ne se voit pas dans OBS.**
C'est une limite technique : `backdrop-filter` ne floute que le contenu HTML derrière la barre. Le verre translucide reste bien visible (c'est lui qui détache l'overlay), et le curseur **Flou du fond** règle l'intensité du grain givré. Pour flouter réellement la vidéo, suis la méthode OBS de la section 2 (copie du jeu recadrée + filtre Flou, en mode pleine largeur).

**Les valeurs reviennent aux données de démo.**
Le serveur n'était pas lancé (mode local), ou l'ancien état est encore dans le cache OBS : actualise la source, ou vérifie `data/state.json`.

**OBS n'affiche pas les modifications du panneau.**
Le panneau doit être ouvert via `http://localhost:3000` (serveur lancé) — pas en double-cliquant sur le fichier HTML (`file://`). Vérifie le badge en haut à droite du panneau.

**Puis-je utiliser une autre résolution ?**
Oui : la barre est en `width: 100%` / proportionnelle à `--bar-h`. Règle la source OBS à la taille de ta scène, et ajuste la hauteur. En dessous de 1100 px de large, les libellés se masquent automatiquement.

**Les polices ne s'affichent pas.**
Elles sont embarquées dans `assets/fonts` (Barlow Condensed + Saira Stencil One) : aucun accès Internet n'est nécessaire.

---

## Licence

MIT — fais-en ce que tu veux pour ton stream.
