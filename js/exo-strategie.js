// Challenger — ce qu'on demande à l'IA : la stratégie et les questions d'une séance, puis le bilan des erreurs.
// Les consignes fixes (SYSTEME_…) ne changent jamais : seules les données de la séance varient, en format compact.

import { plain } from './text.js';
import { kanjiConnus } from './exo-sources.js';
import { MARQUES, tirerPondere } from './exo-outils.js';

export const SYSTEME_SEANCE = `Tu es « le Challenger », coach de japonais d'un francophone qui apprend seul pour le JLPT (N5 fini côté kanji, N4 en cours ; grammaire et vocabulaire plus bas).
Le Challenger est là pour CHALLENGER : le forcer à RESTITUER ce qu'il a appris, pas à reconnaître.
Tu reçois son carnet (ce que tu as noté de ses difficultés), sa réussite récente et des CIBLES : éventuellement les leçons qu'il a CHOISIES pour cette séance (son focus), la grammaire, ce qu'il a épinglé (⭐ leçons, 📌 mots : à faire revenir plus souvent), d'autres leçons déjà faites tirées au hasard (elles doivent revenir aussi) et des nouveautés du JLPT de son niveau.
Ta mission pour CETTE séance :
1. Choisir une stratégie (2 phrases en français, tutoiement) : sur quoi insister et comment, d'après le carnet et les cibles.
2. Écrire exactement le nombre de questions demandé, en respectant la répartition.
Principes :
- Faire RETROUVER de mémoire (production, rappel), pas seulement reconnaître. Varier la forme pour une même notion.
- MÉLANGER : une même phrase fait travailler à la fois la grammaire, le vocabulaire et les kanji (ex. un mot épinglé + un kanji connu à lire + un point de grammaire). Une phrase peut porter plusieurs questions : c'est le type « trous ».
- Pièges = vraies confusions d'un apprenant francophone et celles du carnet. Une SEULE bonne réponse, qui se déduit du japonais seul (pas de la traduction).
- Japonais naturel, grammaire et vocabulaire de niveau N5/N4 (ou celui de la cible). Pas de 私は inutile.
- Nouveautés : la question peut enseigner (consigne explicite, indice dans la phrase), puis l'explication fixe le sens et la lecture.
- Adapter la difficulté : réussite élevée → plus de questions à taper, moins de furigana, format JLPT ; réussite faible → consolider.
- Reconnaître un kanji n'est pas savoir le lire : distingue toujours SENS et LECTURE. Pour un kanji ou un mot dont il connaît sans doute le sens (kanji connus, mots déjà vus, carnet), fais-lui plutôt PRODUIRE la lecture (saisie en hiragana) que reconnaître le sens.
- GRAMMAIRE : c'est LUI qui doit choisir la forme. La consigne ne nomme JAMAIS la forme à produire (pas de « forme て », « mets à la forme ている », « au passé », « ない形 »…) : seule la situation ou le sens (contexte de la phrase, ou une courte phrase française pour une traduction) lui dit s'il faut ている, てはいけません, てもいいです, てください, たことがあります, たい, ないでください, つもり, でしょう… Exemple : « Ici, c'est interdit. » + たばこを＿【吸う】 → すってはいけません. Le mot à transformer peut être donné entre 【 】 à sa forme du dictionnaire. Autres formes : traduction courte français → japonais (script « libre ») qui oblige à utiliser le point visé ; remise en ordre de phrases longues (5 à 7 morceaux, avec から, とき, ので, une relative…) ; choix entre formes voisines (ている/てある/てもいい/てはいけない, は/が, に/で, から/ので…) où deux sont plausibles mais une seule va dans le contexte. Combine souvent deux points de grammaire dans une même phrase, dans des contextes inattendus. Ne repose pas un point trivial qu'il réussit déjà (carnet, réussite).
- Les épinglés (⭐ 📌) sont une insistance : ils reviennent plus souvent, mais n'empêchent pas les autres leçons de revenir.
- Monter d'un cran ce qui est réussi : reconnaître → lire → écrire / retrouver soi-même (ex. traduire 三時半 → plus tard, trouver さんじはん sans aide).
- La consigne ne donne JAMAIS la réponse ni d'indice qui la rend évidente : pas de lecture entre parenthèses, pas de décomposition du kanji (« trois arbres »), pas du mot attendu, pas le nom de la forme.
- Styles JLPT possibles (indique-le dans « style ») : 読み (lecture), 表記 (écriture), 文脈規定 (mot qui convient), 言い換え類義 (même sens), 用法 (bon emploi), 文法形式 (bonne forme), 文の組み立て (remise en ordre). Écris-les « à la manière du JLPT », jamais copiés.
Format :
- Furigana {漢字|かな} sur tout kanji absent de la liste « kanji connus » ; les kanji connus s'écrivent sans furigana. Gras **…** pour le mot visé.
- Jamais de furigana ni d'indice qui donne la réponse : pour une question de lecture (読み), le mot visé s'écrit sans furigana.
- type « choix » : 4 choix (« choix »), « bonne » = indice (0 à 3) de la bonne réponse. Deux choix ne doivent jamais s'écrire pareil.
- type « saisie » : réponse courte à taper au clavier japonais : lecture en hiragana d'un mot (script « kana »), mot ou forme qui manque dans une phrase (« kana »), ou courte traduction français → japonais (script « libre »). « reponses » = TOUTES les réponses acceptées (hiragana, et forme en kanji si possible).
- type « trous » : UNE phrase, 2 à 4 réponses à taper. Dans « jp », chaque trou est marqué ①, ②, ③… (à la place du mot manquant, éventuellement suivi de 【mot du dictionnaire】). « trous » = la liste dans l'ordre : pour chacun « reponses » (toutes les réponses acceptées), « script » (kana/libre) et « indication » courte si utile (ex. « 読み：森 » pour lire un mot de la phrase écrit en **gras** sans furigana — un tel trou n'a pas de marque dans la phrase ; sinon laisse l'indication vide ou donne le sens visé, jamais la réponse ni le nom de la forme). Mélange les sortes de trous : une forme grammaticale, un mot de vocabulaire, une lecture de kanji, une particule…
- type « ordre » : « morceaux » = 3 à 7 morceaux dans l'ordre correct ; un seul ordre naturel possible.
- « jp » : la phrase japonaise (trou noté ＿ si besoin) ; « fr » : sa traduction (montrée après la réponse) ; « consigne » : courte, dans la langue demandée (voir « Langue des consignes »).
- « explication » : 1 phrase en français, montrée juste après la réponse (pour « trous » : une courte explication par trou). « intention » : pourquoi tu poses cette question (quelques mots).
- « cible » : l'identifiant de la cible principale, recopié tel quel (ex. G:n5-12, mot:日本, kanji:町).
Réponds uniquement en JSON, selon le schéma.`;

export const SCHEMA_SEANCE = {
  type: 'object',
  properties: {
    strategie: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['choix', 'saisie', 'trous', 'ordre'] },
          cible: { type: 'string' },
          style: { type: 'string' },
          consigne: { type: 'string' },
          jp: { type: 'string' },
          fr: { type: 'string' },
          choix: { type: 'array', items: { type: 'string' } },
          bonne: { type: 'integer' },
          reponses: { type: 'array', items: { type: 'string' } },
          script: { type: 'string', enum: ['kana', 'libre'] },
          morceaux: { type: 'array', items: { type: 'string' } },
          trous: {
            type: 'array',
            items: {
              type: 'object',
              properties: { indication: { type: 'string' }, reponses: { type: 'array', items: { type: 'string' } }, script: { type: 'string', enum: ['kana', 'libre'] } },
              required: ['reponses'],
            },
          },
          explication: { type: 'string' },
          intention: { type: 'string' },
        },
        required: ['type', 'cible', 'consigne', 'explication'],
      },
    },
  },
  required: ['strategie', 'questions'],
};

export const SYSTEME_BILAN = `Tu es « le Challenger », coach de japonais d'un francophone (JLPT N5/N4). La séance est finie.
Tu reçois son carnet et SEULEMENT ses erreurs (question, bonne réponse, sa réponse) et ses réponses tapées « à vérifier ».
1. « verdicts » : pour chaque réponse « à vérifier », dis si elle est correcte en japonais (ok vrai/faux).
2. « erreurs » : pour chaque erreur (identifiant recopié), « pourquoi » = la cause précise en français simple (confusion entre deux mots, règle pas acquise, lecture du kanji…), « retenir » = un moyen court de ne plus se tromper (règle, contraste, moyen mnémotechnique). Tutoiement, 1 à 2 phrases chacun.
3. « consignes » : 2 à 4 consignes concrètes pour la suite, d'après les causes communes.
4. « etoiles » : identifiants de leçons (ex. G:n5-12) qu'il devrait étoiler pour les revoir, seulement parmi les cibles fournies et seulement si l'erreur montre que la leçon n'est pas comprise.
5. « carnet » : réécris son carnet (120 mots maximum) : ses difficultés durables, ses progrès, ce qu'il faut travailler ensuite. Distingue sens et lecture (ex. « 森 : sens connu, lecture à revoir »). Garde ce qui reste vrai, retire ce qui est réglé.
Réponds uniquement en JSON, selon le schéma.`;

export const SCHEMA_BILAN = {
  type: 'object',
  properties: {
    verdicts: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, ok: { type: 'boolean' } }, required: ['id', 'ok'] } },
    erreurs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, pourquoi: { type: 'string' }, retenir: { type: 'string' } }, required: ['id', 'pourquoi'] } },
    consignes: { type: 'array', items: { type: 'string' } },
    etoiles: { type: 'array', items: { type: 'string' } },
    carnet: { type: 'string' },
  },
  required: ['erreurs', 'consignes', 'carnet'],
};

// ---------- Données de la séance (format compact) ----------

const court = (s, n) => { const t = plain(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const motCourt = m => `${plain(m.jp)}${m.kana && m.kana !== plain(m.jp) ? `(${m.kana})` : ''}=${court(m.fr, 24)}`;
export const idLecon = l => `${l.lettre}:${l.id}`;

function ligneLecon(l) {
  const mots = l.mots.slice(0, 5).map(motCourt).join(', ');
  const kanji = l.kanji.map(k => `${k.k}=${court(k.sens, 18)}`).join(' ');
  return `- ${idLecon(l)} [${l.niveau}] ${court(l.titre, 60)}${l.points.length ? ` | points: ${l.points.slice(0, 4).map(p => court(p, 40)).join(' ; ')}` : ''}${kanji ? ` | kanji: ${kanji}` : ''}${mots ? ` | mots: ${mots}` : ''}`;
}

// Choisit les cibles (sans IA) et écrit le message de la séance.
// etats : un par appli (exo-sources.etatAppli) ; liste : mots de Ma liste ; q : quotas ;
// choisies : leçons qu'il a cochées pour CETTE séance (objets leçon), ou [] ; alea : hasard (tests).
export function messageSeance({ etats, liste, carnet, reussite, q, choisies = [], alea = Math.random }) {
  const lignes = [];
  lignes.push(`Carnet : ${carnet || '(vide : première séance)'}`);
  lignes.push(`Réussite récente : ${reussite == null ? 'inconnue' : `${Math.round(reussite * 100)} %`}`);
  // Bonne réussite : consignes courtes en japonais (comme l'appli kanji à partir du bloc 9) ; le français reste pour les nouveautés et les consignes difficiles.
  lignes.push(reussite != null && reussite >= 0.75
    ? 'Langue des consignes : JAPONAIS, très courtes (読み方は？, ＿に入るものは？, 正しいものはどれ？, 意味は？, ならべかえて ください…), avec des kanji connus ou des kana ; en français seulement pour les nouveautés et les consignes difficiles.'
    : 'Langue des consignes : français, courtes.');
  const gram = q.grammaire || 0; // (séance commencée avant l'ajout de la part de grammaire)
  const choix = choisies.length ? q.choisies || 0 : 0;
  const total = choix + gram + q.epingle + q.niveau + q.nouveau;
  const parts = [choix && `${choix} sur SES LEÇONS CHOISIES (voir « Leçons choisies »)`, `${gram} sur la GRAMMAIRE (cible G:…)`, `${q.epingle} sur les épinglés`, `${q.niveau} sur les autres leçons déjà faites`, `${q.nouveau} nouveautés`].filter(Boolean);
  lignes.push(`Questions à écrire : ${total} (dont environ ${q.saisie} à taper, et AU MOINS ${q.trous || 0} de type « trous », plus si c'est utile). Répartition : ${parts.join(', ')}. Une question qui mélange plusieurs cibles compte pour sa cible principale.`);
  lignes.push(`Niveaux en cours : ${etats.map(e => `${e.cours.appli.nom} ${e.niveau}`).join(', ')}`);
  lignes.push(`Kanji connus : ${kanjiConnus(etats).join('') || '(aucun : écris tous les kanji avec furigana)'}`);

  const estG = e => e.cours.appli.id === 'grammaire';
  const g = etats.find(estG);
  const autres = etats.filter(e => !estG(e));
  const pris = new Set(choisies);
  const cibles = { grammaire: [], epingle: [], niveau: [], nouveau: [] };
  // Grammaire : les leçons étoilées (insistance), puis d'autres leçons faites tirées au hasard (les faibles et les anciennes plus souvent).
  if (g) {
    const et = g.etoiles.filter(l => !pris.has(l));
    cibles.grammaire.push(...et.map(l => `${ligneLecon(l)} ⭐`));
    const tirees = tirerPondere(g.faites.filter(l => !g.etoiles.includes(l) && !pris.has(l)), g.poids, Math.max(4, 8 - et.length), alea);
    cibles.grammaire.push(...tirees.map(ligneLecon));
    tirees.forEach(l => pris.add(l));
  }
  for (const e of autres) cibles.epingle.push(...e.etoiles.filter(l => !pris.has(l)).map(ligneLecon));
  // Mots de Ma liste : d'abord les plus ratés et ceux à revoir.
  const mots = [...liste].sort((a, b) => (b.stats.faux - a.stats.faux) || (a.stats.boite - b.stats.boite)).slice(0, 10);
  cibles.epingle.push(...mots.map(m => `- mot:${plain(m.jp)} ${motCourt(m)}${m.stats.vu ? ` (juste ${m.stats.juste}/${m.stats.vu})` : ''}`));
  // Autres leçons déjà faites (tous niveaux) : tirées au hasard, réparties entre les applis, pour que tout revienne.
  const parAppli = Math.max(2, Math.ceil(8 / Math.max(1, autres.length)));
  for (const e of autres) cibles.niveau.push(...tirerPondere(e.faites.filter(l => !e.etoiles.includes(l) && !pris.has(l)), e.poids, parAppli, alea).map(ligneLecon));
  // Nouveautés : kanji des prochaines leçons de kanji, et suite des leçons de vocabulaire du niveau.
  for (const e of etats) {
    if (e.cours.appli.id === 'kanji') {
      for (const l of e.aVenir.slice(0, 3)) cibles.nouveau.push(...l.kanji.map(k => `- kanji:${k.k} ${k.k}=${court(k.sens, 24)} (${court(k.lect, 30)})`));
    } else if (e.cours.appli.id === 'vocabulaire') {
      for (const l of e.aVenir.slice(0, 2)) cibles.nouveau.push(...l.mots.slice(0, 4).map(m => `- mot:${plain(m.jp)} ${motCourt(m)}`));
    }
  }
  // Grammaire finie (toutes les leçons faites) : nouveautés de grammaire du niveau suivant.
  if (g && g.cours.lecons.length && g.faites.length === g.cours.lecons.length) {
    cibles.nouveau.push(`- jlpt-grammaire:N4 points de grammaire N4 courants qu'il n'a pas encore vus (à toi de choisir ; la question enseigne, l'explication fixe la règle)`);
  }
  cibles.nouveau.push(`- jlpt:${etats.find(e => e.cours.appli.id === 'kanji')?.niveau || 'N4'} mots ou kanji très courants du JLPT de ce niveau, pas encore vus (à toi de choisir)`);
  if (choisies.length) lignes.push('Leçons choisies par lui pour cette séance (FOCUS : couvre-les toutes, mélange-les entre elles et avec le reste) :', ...choisies.slice(0, 30).map(ligneLecon));
  lignes.push('Cibles grammaire (⭐ = étoilée : plus souvent ; les autres doivent revenir aussi) :', ...(cibles.grammaire.length ? cibles.grammaire : ['- (aucune leçon faite : grammaire de son niveau, choisie par toi)']));
  lignes.push('Cibles épinglées (insistance) :', ...(cibles.epingle.length ? cibles.epingle.slice(0, 20) : ['- (aucune)']));
  lignes.push('Autres leçons déjà faites (tirées au hasard, à faire revenir) :', ...(cibles.niveau.length ? cibles.niveau : ['- (aucune)']));
  lignes.push('Cibles nouveautés (pas encore vues) :', ...cibles.nouveau.slice(0, 14));
  return lignes.join('\n');
}

// Résumé d'une question pour le bilan (court : c'est ce qui coûte des tokens).
export function resumeQuestion(q) {
  const enonce = court([q.consigne, q.jp].filter(Boolean).join(' / '), 140);
  const attendu = q.type === 'choix' ? plain(q.choix[q.bonne]) : q.type === 'saisie' ? q.reponses.map(plain).join(' | ')
    : q.type === 'trous' ? q.trous.map((t, i) => `${MARQUES[i]} ${t.reponses.map(plain).join(' | ')}`).join(' ; ') : q.morceaux.map(plain).join('');
  return { enonce, attendu };
}

export function messageBilan({ carnet, erreurs, doutes, cibles }) {
  const l = [`Carnet : ${carnet || '(vide)'}`, `Cibles de la séance : ${cibles.join(', ') || '(aucune)'}`, 'Erreurs :'];
  for (const e of erreurs) l.push(`- ${e.id} [${e.cible}] Q: ${e.enonce} | attendu: ${e.attendu} | sa réponse: ${e.donne}`);
  if (!erreurs.length) l.push('- (aucune)');
  if (doutes.length) {
    l.push('Réponses tapées à vérifier :');
    for (const d of doutes) l.push(`- ${d.id} Q: ${d.enonce} | prévu: ${d.attendu} | sa réponse: ${d.donne}`);
  }
  return l.join('\n');
}

// ---------- Séance sans IA : exercices existants des 3 applis ----------

// Convertit un exercice d'une appli de cours au format du Challenger.
export function depuisExercice(app, ex) {
  const base = { id: `c:${app.lettre}:${ex.id}`, cible: `${app.lettre}:${ex.lecon}`, style: app.nom, source: 'cours', consigne: plain(ex.q || ''), jp: ex.jp || '', fr: ex.fr || '', explication: ex.explain || '' };
  if (ex.type === 'choice') return { ...base, type: 'choix', choix: ex.choices, bonne: ex.a, consigne: base.consigne || (ex.jp?.includes('＿') ? 'Complète la phrase.' : 'Choisis la bonne réponse.') };
  if (ex.type === 'order') return { ...base, type: 'ordre', morceaux: ex.tokens, alt: ex.alt || [], consigne: base.consigne || 'Remets les mots dans l’ordre.' };
  return null;
}
