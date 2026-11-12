# 挑戦 Challenger

Appli web perso (violette) qui **défie** : des séances de 35 questions de japonais écrites par une IA
à partir de ce que tu fais dans les applis [grammaire](https://sapeuri2.github.io/nihongo-grammaire/),
[vocabulaire](https://sapeuri2.github.io/nihongo-vocabulaire/) et [kanji](https://sapeuri2.github.io/nihongo-kanji/).

- En priorité : tes leçons étoilées ⭐ et tes mots épinglés 📌 ; aussi les leçons déjà faites de ton niveau en cours,
  et 20 % de nouveautés du JLPT de ton niveau.
- Questions à choix, réponses à taper au clavier japonais (environ 1 sur 3), remises en ordre, style JLPT.
- Les erreurs reviennent dans la séance ; à la fin, l'IA explique chaque erreur, donne des consignes, propose
  d'étoiler des leçons et tient ton carnet (ce qu'elle a retenu de tes difficultés).
- L'IA n'est appelée que pendant une séance (une fois pour les questions, une fois pour le bilan).
  Une séance interrompue se reprend sans nouvel appel. Sans clé ou sans réseau : séance avec les exercices des applis.

**Clé IA** : clé Gemini gratuite (aistudio.google.com), collée dans les réglages. Elle reste sur l'appareil :
jamais dans ce dépôt ni dans le Gist.

Le code est géré par l'agent central ([nihongo-central](https://github.com/Sapeuri2/nihongo-central)) et déployé
par son outil (`moteur-version.json`) : ne pas modifier les fichiers ici.
