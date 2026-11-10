/*
 * Configuration de l'overlay — modifiable sans toucher au reste du code.
 * Les mêmes valeurs se retrouvent dans le panneau de contrôle (control.html),
 * qui les enregistre dans le navigateur / le petit serveur local.
 */
window.OVERLAY_CONFIG = {
  /* Textes affichés devant chaque valeur */
  labels: {
    follower: "Dernier follower",
    sub: "Dernier sub",
    subgift: "Dernier subgift",
    bits: "Dernier bits",
    donation: "Dernier don",
    goal: "Objectif",
  },

  /* Valeurs par défaut (données de démonstration au premier lancement).
     Tu peux les remplacer par des chaînes vides pour démarrer "propre". */
  defaults: {
    streamer: "LordHurTV",

    follower: {
      name: "Litchitchi",
      at: null,
    },

    sub: {
      name: "Nymphidiel_",
      tier: "Tier 2",
      months: 13,
      giftedBy: "",      // rempli => affiché comme "subgift de <donateur>"
      giftCount: 0,      // 5 => "x5 offerts par <donateur>"
      at: null,
    },

    cheer: {
      kind: "bits",      // "bits" ou "donation"
      name: "Miguel",
      bits: 500,
      amount: 0,
      currency: "€",
      at: null,
    },

    goal: {
      current: 157,
      target: 170,
      label: "SUBS",
    },

    show: {
      follower: true,
      sub: true,
      cheer: true,
      goal: true,
      clock: true,
    },

    theme: {
      accent: "#F0610F",
      opacity: 0.68,     // transparence du fond de la barre (0.2 → 1)
      blur: 12,          // flou du fond (px)
      height: 64,        // hauteur de la barre (px, sur une scène 1920x1080)
      mode: "right",     // "full" = pleine largeur, "right" = barre ajustée à droite
      animations: true,
      hideEmpty: false,
      uppercase: true,
      progress: true,    // petite ligne de progression sous l'objectif
    },

    clock: {
      seconds: true,
      showDate: true,
    },
  },

  /* Synchronisation optionnelle via Supabase (GitHub Pages / contrôle à distance).
     Renseigne les deux champs + passe persist à true pour garder l'état après
     rechargement. Voir le README pour le script SQL de la table. */
  cloud: {
    supabaseUrl: "",
    supabaseAnonKey: "",
    channel: "lordhurtv-overlay",
    table: "overlay_state",
    rowId: "lordhurtv",
    persist: false,
  },
};
