// Challenger — ce qu'il lit des 3 applis de cours, qui sont à la même adresse (sapeuri2.github.io) :
// leur contenu (fichiers data/) et la progression enregistrée sur cet appareil.
// LECTURE SEULE : le Challenger n'écrit jamais dans leurs clés (une appli ouverte ailleurs les écraserait).

import { plain } from './text.js';
import { poidsLecon } from './exo-outils.js';

export const APPS = [
  { id: 'grammaire', nom: 'Grammaire', dossier: 'nihongo-grammaire', cle: 'ng-state-v1', lettre: 'G' },
  { id: 'vocabulaire', nom: 'Vocabulaire', dossier: 'nihongo-vocabulaire', cle: 'nv-state-v1', lettre: 'V' },
  { id: 'kanji', nom: 'Kanji', dossier: 'nihongo-kanji', cle: 'nk-state-v1', lettre: 'K' },
];
export const appParLettre = Object.fromEntries(APPS.map(a => [a.lettre, a]));

// Adresse d'une page d'une autre appli (ex. une leçon à étoiler).
export const urlAppli = (a, chemin = '') => new URL(`../${a.dossier}/${chemin}`, location.href).href;

export function progression(a) {
  try { return JSON.parse(localStorage.getItem(a.cle)) || null; } catch { return null; }
}

async function json(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return r.json();
}

// Kanji d'une fiche de l'appli kanji : sections « 町 · ville, quartier » avec « **On** : … **Kun** : … ».
function kanjiDeLecon(l) {
  const out = [];
  for (const s of l.sections || []) {
    const m = String(s.h || '').match(/^([㐀-鿿]) · (.+)$/);
    if (!m) continue;
    const lect = plain((s.p || [])[0] || '').replace(/\s+/g, ' ').replace(/On ?: ?/, 'on ').replace(/Kun ?: ?/, 'kun ').trim();
    out.push({ k: m[1], sens: plain(m[2]), lect });
  }
  return out;
}

// Une leçon réduite à l'essentiel (c'est ce qui part vers l'IA : il faut que ce soit court).
function resume(a, b, l, num) {
  const mots = [
    ...(l.words || []).map(w => ({ jp: w.jp, kana: w.kana, fr: plain(w.fr) })),
    ...(l.sections || []).flatMap(s => (s.vocab || []).map(v => ({ jp: v.jp, kana: '', fr: plain(v.fr) }))),
  ];
  return {
    app: a.id, lettre: a.lettre, id: l.id, num, niveau: b.level || '', bloc: b.id,
    titre: plain(l.title),
    points: (l.sections || []).map(s => plain(s.h)).filter(Boolean).slice(0, 6),
    mots,
    kanji: a.id === 'kanji' ? kanjiDeLecon(l) : [],
    exercices: l.exercises || [],
  };
}

// Cours d'une appli : leçons dans l'ordre, et pour chaque exercice sa leçon.
export async function chargerCours(a) {
  const base = urlAppli(a);
  const man = await json(`${base}data/manifest.json`);
  const blocs = await Promise.all(man.blocks.map(f => json(base + f)));
  const lecons = [];
  let num = 0;
  for (const b of blocs) for (const l of b.lessons) lecons.push(resume(a, b, l, ++num));
  const leconDe = {};
  for (const l of lecons) for (const e of l.exercices) leconDe[e.id] = l.id;
  return { appli: a, lecons, parId: Object.fromEntries(lecons.map(l => [l.id, l])), leconDe };
}

// Où en est l'utilisateur dans une appli : leçons faites, niveau en cours, étoiles, leçons faibles.
export function etatAppli(cours, now = Date.now()) {
  const prog = progression(cours.appli) || {};
  const faites = cours.lecons.filter(l => prog.lessons?.[l.id]?.done);
  const premiere = cours.lecons.find(l => !prog.lessons?.[l.id]?.done);
  const niveau = (premiere || cours.lecons.at(-1))?.niveau || '';
  const etoiles = Object.entries(prog.etoiles || {}).filter(([id, e]) => e?.on && cours.parId[id]).map(([id]) => cours.parId[id]);
  // Erreurs et révisions en retard par leçon, d'après la répétition espacée de l'appli.
  const stats = {};
  for (const [id, r] of Object.entries(prog.items || {})) {
    const lid = cours.leconDe[id];
    if (!lid) continue;
    const s = (stats[lid] ||= { ko: 0, dues: 0 });
    s.ko += r.box === 0 ? (r.ko || 0) + 1 : 0;
    if (r.due <= now) s.dues++;
  }
  const poids = l => poidsLecon({ ...(stats[l.id] || {}), t: prog.lessons?.[l.id]?.t }, now);
  const duNiveau = faites.filter(l => l.niveau === niveau).sort((x, y) => poids(y) - poids(x));
  // Pas encore vues, dans l'ordre du cours (la suite du niveau en cours).
  const aVenir = cours.lecons.filter(l => !prog.lessons?.[l.id]?.done && l.niveau === niveau);
  return { cours, faites, niveau, etoiles, duNiveau, aVenir, stats };
}

// Kanji déjà vus (leçons faites de l'appli kanji) : l'IA écrit les autres avec des furigana.
export function kanjiConnus(etats) {
  const k = etats.find(e => e.cours.appli.id === 'kanji');
  return k ? k.faites.flatMap(l => l.kanji.map(x => x.k)) : [];
}
