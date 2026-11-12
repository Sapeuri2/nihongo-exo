// Challenger — une séance : préparation (cibles choisies sur place, questions écrites par l'IA),
// réponses (vérifiées sur place, sans appel), bilan des erreurs (un appel à la fin). Reprise après interruption.
// Données synchronisées (dans la progression du Challenger) : banque des questions, carnet, bilans.

import { plain } from './text.js';
import * as S from './state.js';
import * as L from './liste.js';
import { CONFIG } from './config.js';
import { APPS, appParLettre, chargerCours, etatAppli } from './exo-sources.js';
import * as IA from './exo-ia.js';
import { SCHEMA_BILAN, SCHEMA_SEANCE, SYSTEME_BILAN, SYSTEME_SEANCE, depuisExercice, messageBilan, messageSeance, resumeQuestion } from './exo-strategie.js';
import { MARQUES, elaguerBanque, fusionBanque, fusionBilans, fusionCarnet, quotas, reprises, tirerPondere, validerQuestion, verifierSaisie, verifierTrous } from './exo-outils.js';

// Règles de fusion entre appareils des champs propres au Challenger.
S.fusionChamp('banque', fusionBanque);
S.fusionChamp('carnet', fusionCarnet);
S.fusionChamp('bilans', fusionBilans);

const SEANCE_KEY = `${CONFIG.storageKey}:seance`;
const PARTS = { reprise: CONFIG.partReprise, nouveau: CONFIG.partNouveau, grammaire: CONFIG.partGrammaire, saisie: CONFIG.partSaisie, trous: CONFIG.trousMin };
const ecouteurs = new Set();
let seance = charger();

export const get = () => seance;
export const onChange = f => { ecouteurs.add(f); };
const prevenir = () => { sauver(); ecouteurs.forEach(f => f()); };

function charger() {
  try { return JSON.parse(localStorage.getItem(SEANCE_KEY)) || null; } catch { return null; }
}
function sauver() {
  try {
    if (seance) localStorage.setItem(SEANCE_KEY, JSON.stringify(seance));
    else localStorage.removeItem(SEANCE_KEY);
  } catch { /* stockage indisponible */ }
}

// ---------- Données du Challenger dans sa progression ----------

export const banque = () => S.get().banque || {};
export const carnet = () => S.get().carnet || null;
export const bilans = () => Object.values(S.get().bilans || {}).sort((a, b) => b.t - a.t);
function maj(champs) {
  S.replace({ ...S.get(), ...champs });
}

// Réussite des 3 dernières séances (pour adapter la difficulté).
export function reussite() {
  const b = bilans().slice(0, 3).filter(x => x.score?.total);
  return b.length ? b.reduce((s, x) => s + x.score.ok, 0) / b.reduce((s, x) => s + x.score.total, 0) : null;
}

export const aRevoir = () => reprises(banque(), S.get().items).length;

// ---------- Contexte : les 3 applis (contenu + progression sur cet appareil) ----------

let contexteP = null;
export function contexte() {
  contexteP ||= Promise.all(APPS.map(a => chargerCours(a).catch(() => null))).then(cs => {
    const etats = cs.filter(Boolean).map(c => etatAppli(c));
    if (!etats.length) throw new Error('Impossible de lire le contenu des applis (hors ligne ?).');
    return { etats, parLettre: Object.fromEntries(etats.map(e => [e.cours.appli.lettre, e.cours])) };
  });
  contexteP.catch(() => { contexteP = null; });
  return contexteP;
}

const melanger = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const nouvelId = i => `x${Date.now().toString(36)}${i.toString(36).padStart(2, '0')}`;

// ---------- Préparer une séance ----------

// Leçons choisies pour une séance : identifiants « G:n5-05 » → leçons (celles qui existent encore).
function leconsChoisies(etats, ids) {
  const par = Object.fromEntries(etats.map(e => [e.cours.appli.lettre, e.cours]));
  return (ids || []).map(c => { const [lettre, id] = String(c).split(':'); return par[lettre]?.parId[id]; }).filter(Boolean);
}

// choisies : leçons cochées pour CETTE séance seulement (« Je choisis mes leçons »), ex. ['G:n5-05', 'K:k4-02'].
export async function demarrer({ sansIA = false, choisies = [] } = {}) {
  const { etats } = await contexte();
  const items = S.get().items;
  const aReprendre = reprises(banque(), items);
  const choix = leconsChoisies(etats, choisies).map(l => `${l.lettre}:${l.id}`);
  const q = quotas(CONFIG.seanceTaille, PARTS, aReprendre.length, { focus: choix.length > 0 });
  const questions = {};
  for (const id of aReprendre.slice(0, q.reprise)) questions[id] = banque()[id];
  seance = {
    id: `s${Date.now().toString(36)}`, debut: Date.now(), mode: sansIA || !IA.aUneCle() ? 'cours' : 'ia',
    strategie: '', questions, file: melanger(Object.keys(questions)).map(id => ({ id, essai: 0 })), idx: 0,
    premiers: {}, reponses: {}, cur: null, gen: null, genErreur: '', quotas: q, fin: false, bilanErreur: '', choisies: choix,
  };
  if (seance.mode === 'cours') completerSansIA(etats);
  else seance.gen = 'attente';
  prevenir();
  if (seance.mode === 'ia') generer();
}

// Questions de l'IA : arrivent pendant qu'on répond aux reprises.
export async function generer() {
  if (!seance || seance.mode !== 'ia') return;
  seance.gen = 'attente';
  seance.genErreur = '';
  prevenir();
  const s = seance;
  try {
    const { etats } = await contexte();
    const message = messageSeance({ etats, liste: L.list(), carnet: carnet()?.texte, reussite: reussite(), q: s.quotas, choisies: leconsChoisies(etats, s.choisies) });
    const r = await IA.appeler({ systeme: SYSTEME_SEANCE, message, schema: SCHEMA_SEANCE });
    if (seance !== s) return; // séance abandonnée entre-temps
    const valides = (r.questions || []).map(validerQuestion).filter(Boolean);
    if (!valides.length) throw new IA.ErreurIA('reponse', `${IA.nomIA()} n’a renvoyé aucune question utilisable.`);
    const t = Date.now();
    const nouvelles = valides.map((x, i) => ({ ...x, id: nouvelId(i), source: 'ia', t }));
    for (const x of nouvelles) s.questions[x.id] = x;
    // Les nouvelles questions sont mêlées à celles qui restent (la question à l'écran ne bouge pas).
    const garde = s.file.slice(0, s.idx + (s.cur ? 1 : 0));
    const reste = s.file.slice(garde.length);
    s.file = [...garde, ...melanger([...reste, ...nouvelles.map(x => ({ id: x.id, essai: 0 }))])];
    s.strategie = String(r.strategie || '').trim();
    s.gen = 'faite';
    // Banque : les questions de l'IA sont gardées (synchronisées) pour revenir plus tard sans nouvel appel.
    maj({ banque: elaguerBanque({ ...banque(), ...Object.fromEntries(nouvelles.map(x => [x.id, x])) }, S.get().items, CONFIG.banqueMax) });
  } catch (e) {
    if (seance !== s) return;
    s.gen = 'echec';
    s.genErreur = e.message || String(e);
  }
  prevenir();
}

// Complète la séance avec des exercices existants des 3 applis (sans IA, sans coût).
function completerSansIA(etats) {
  const s = seance;
  const manque = CONFIG.seanceTaille - s.file.length;
  const tirer = (lecons, n) => melanger(lecons.flatMap(l => l.exercices.map(ex => [l, ex]))).slice(0, n);
  const choisis = [];
  const focus = leconsChoisies(etats, s.choisies);
  const estG = e => e.cours.appli.id === 'grammaire';
  const g = etats.find(estG);
  const grammaire = g ? [...g.etoiles, ...tirerPondere(g.faites.filter(l => !g.etoiles.includes(l)), g.poids, 6)] : [];
  const autres = etats.filter(e => !estG(e));
  const epingle = autres.flatMap(e => e.etoiles);
  const niveau = autres.flatMap(e => tirerPondere(e.faites.filter(l => !e.etoiles.includes(l)), e.poids, 6));
  const nouveau = etats.flatMap(e => e.aVenir.slice(0, 1));
  const tranches = focus.length
    ? [[focus, Math.round(manque * 0.65)], [grammaire, Math.round(manque * 0.15)], [[...epingle, ...niveau], Math.round(manque * 0.15)], [nouveau, manque]]
    : [[grammaire, Math.round(manque * 0.35)], [epingle, Math.round(manque * 0.3)], [niveau, Math.round(manque * 0.3)], [nouveau, manque]];
  for (const [lecons, n] of tranches) {
    for (const [l, ex] of tirer(lecons, n)) {
      if (choisis.length >= manque) break;
      const q = depuisExercice(appParLettre[l.lettre], { ...ex, lecon: l.id });
      if (q && !s.questions[q.id]) { s.questions[q.id] = q; choisis.push(q.id); }
    }
  }
  s.file = [...s.file.slice(0, s.idx + (s.cur ? 1 : 0)), ...melanger([...s.file.slice(s.idx + (s.cur ? 1 : 0)), ...choisis.map(id => ({ id, essai: 0 }))])];
}

// L'IA n'a pas pu écrire les questions : on continue avec les exercices des applis.
export async function continuerSansIA() {
  if (!seance) return;
  const { etats } = await contexte();
  seance.mode = 'cours';
  seance.gen = null;
  completerSansIA(etats);
  prevenir();
}

// ---------- Répondre ----------

export const question = () => (seance && seance.idx < seance.file.length ? seance.questions[seance.file[seance.idx].id] : null);

export function initCourante() {
  const q = question();
  if (!q || seance.cur?.id === q.id) return;
  const ordre = q.type === 'choix' ? melanger(q.choix.map((_, i) => i)) : q.type === 'ordre' ? melanger(q.morceaux.map((_, i) => i)) : null;
  seance.cur = { id: q.id, ordre, place: [], repondu: false };
  sauver();
}

export function repondre(valeur) {
  const q = question();
  const cur = seance?.cur;
  if (!q || !cur || cur.repondu) return;
  const pos = seance.file[seance.idx];
  let res;
  let donne;
  if (q.type === 'choix') { res = valeur === q.bonne ? 'ok' : 'faux'; donne = plain(q.choix[valeur]); }
  else if (q.type === 'saisie') { res = verifierSaisie(valeur, q); donne = String(valeur); }
  else if (q.type === 'trous') {
    const v = q.trous.map((_, i) => String(valeur?.[i] ?? ''));
    const r = verifierTrous(v, q);
    res = r.res;
    cur.detail = r.detail;
    donne = v.map((x, i) => `${MARQUES[i]} ${x || '—'}`).join(' ; ');
  }
  else {
    const fait = cur.place.map(i => q.morceaux[i]);
    res = [q.morceaux, ...(q.alt || [])].some(sol => sol.length === fait.length && sol.every((t, i) => t === fait[i])) ? 'ok' : 'faux';
    donne = fait.map(plain).join('');
  }
  Object.assign(cur, { repondu: true, res, donne, choisi: valeur });
  if (!pos.essai) {
    seance.premiers[q.id] = res;
    seance.reponses[q.id] = donne;
    if (res !== 'doute') S.recordAnswer(q.id, res === 'ok');
  }
  // Une question ratée revient une fois plus loin dans la séance.
  if (res === 'faux' && !pos.essai) {
    const at = Math.min(seance.file.length, seance.idx + 3 + Math.floor(Math.random() * 4));
    seance.file.splice(at, 0, { id: q.id, essai: 1 });
  }
  prevenir();
}

export function placer(i) { seance.cur.place.push(i); prevenir(); }
export function retirer(i) { seance.cur.place = seance.cur.place.filter(x => x !== i); prevenir(); }

export function suivant() {
  if (!seance) return;
  seance.idx++;
  seance.cur = null;
  // Fin de la séance (sauf si les questions de l'IA sont encore attendues, ou si leur écriture a échoué : on propose alors de continuer sans IA).
  if (seance.idx >= seance.file.length && seance.gen !== 'attente' && seance.gen !== 'echec') seance.fin = true;
  prevenir();
  return seance.fin ? faireBilan() : null;
}

export function abandonner() {
  seance = null;
  prevenir();
}

// ---------- Bilan ----------

export async function faireBilan({ sansIA = false } = {}) {
  const s = seance;
  if (!s?.fin) return null;
  s.bilanErreur = '';
  s.bilanEnCours = true;
  prevenir();
  const ids = Object.keys(s.premiers);
  const lignes = id => ({ id, cible: s.questions[id].cible, ...resumeQuestion(s.questions[id]), donne: s.reponses[id] || '' });
  const erreurs = ids.filter(id => s.premiers[id] === 'faux').map(lignes);
  const doutes = ids.filter(id => s.premiers[id] === 'doute').map(lignes);
  let ia = null;
  try {
    if (!sansIA && IA.aUneCle() && (erreurs.length || doutes.length)) {
      const cibles = [...new Set(ids.map(id => s.questions[id].cible).filter(c => /^[GVK]:/.test(c)))];
      ia = await IA.appeler({ systeme: SYSTEME_BILAN, message: messageBilan({ carnet: carnet()?.texte, erreurs, doutes, cibles }), schema: SCHEMA_BILAN, maxTokens: 8000 });
    }
  } catch (e) {
    if (seance === s) { s.bilanErreur = e.message || String(e); s.bilanEnCours = false; prevenir(); }
    return null;
  }
  // Réponses tapées « à vérifier » : jugées par l'IA (sans IA : comptées fausses).
  const verdict = Object.fromEntries((ia?.verdicts || []).map(v => [v.id, !!v.ok]));
  for (const d of doutes) {
    const ok = verdict[d.id] === true;
    S.recordAnswer(d.id, ok);
    s.premiers[d.id] = ok ? 'ok' : 'faux';
    if (!ok) erreurs.push(d);
  }
  const expl = Object.fromEntries((ia?.erreurs || []).map(e => [e.id, e]));
  const { parLettre } = await contexte().catch(() => ({ parLettre: {} }));
  const lecon = cible => { const [lettre, id] = String(cible).split(':'); const l = parLettre[lettre]?.parId[id]; return l ? { lettre, id: l.id, num: l.num, titre: l.titre, app: l.app } : null; };
  // Leçons à étoiler : proposées par l'IA, sinon celles ratées au moins deux fois.
  const compte = {};
  for (const e of erreurs) compte[e.cible] = (compte[e.cible] || 0) + 1;
  const proposees = ia?.etoiles?.length ? ia.etoiles : Object.keys(compte).filter(c => compte[c] >= 2);
  const etoiles = [...new Set(proposees)].map(lecon).filter(Boolean);
  const ok = Object.values(s.premiers).filter(r => r === 'ok').length;
  const bilan = {
    id: s.id, t: Date.now(), mode: ia ? 'ia' : 'local', strategie: s.strategie,
    score: { ok, total: Object.keys(s.premiers).length },
    erreurs: erreurs.map(e => ({ ...e, pourquoi: expl[e.id]?.pourquoi || s.questions[e.id].explication || '', retenir: expl[e.id]?.retenir || '' })),
    consignes: (ia?.consignes || []).filter(Boolean),
    etoiles,
  };
  const champs = { bilans: fusionBilans(S.get().bilans, { [bilan.id]: bilan }) };
  if (ia?.carnet) champs.carnet = { texte: String(ia.carnet).trim(), t: Date.now() };
  maj(champs);
  if (seance === s) seance = null;
  prevenir();
  return bilan;
}

export const bilanParId = id => (S.get().bilans || {})[id] || null;

// Mot à épingler depuis une question (Ma liste, commune aux applis).
export function motDeQuestion(q) {
  const m = String(q.cible || '').match(/^mot:(.+)$/);
  return m ? m[1] : null;
}
