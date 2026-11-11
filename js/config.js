// Réglages propres à CETTE appli (le Challenger). Valeurs seulement.

export const CONFIG = {
  // Stockage : propre au Challenger (le domaine sapeuri2.github.io est partagé avec les 3 autres applis).
  // Ne jamais modifier une fois en ligne, sinon la progression est perdue.
  storageKey: 'nx-state-v1',
  syncKey: 'nx-sync',
  gistFile: 'nihongo-exo-progression.json',
  gistDescription: 'Progression nihongo-exo, le Challenger (ne pas supprimer)',
  tokenName: 'nihongo-exo',
  appId: 'exo', // nom de l'appli dans « Ma liste »
  listeEnabled: true,

  // Séance
  seanceTaille: 30, // questions par séance
  partReprise: 0.25, // part maximale de questions déjà posées à revoir (sans appel à l'IA)
  partNouveau: 0.2, // kanji et mots du JLPT du niveau en cours pas encore vus
  partSaisie: 0.33, // réponses à taper au clavier (le reste : choix, remise en ordre)
  banqueMax: 800, // questions écrites par l'IA gardées pour revenir plus tard
};
