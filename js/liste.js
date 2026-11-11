// « Ma liste » : mots mis de côté, communs à toutes les applis du même domaine.
// Une seule clé de stockage (la même dans chaque appli, indépendante de CONFIG.storageKey)
// et un seul Gist (nihongo-ma-liste.json, géré par sync.js).

const KEY = 'nihongo-ma-liste-v1';
const DAY = 86400000;
const MAX_LOG = 300; // réponses gardées par mot (les plus anciennes sont résumées dans `base`)

// Boîtes de révision (0 à 5) : délai avant la prochaine révision conseillée, en jours.
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = INTERVALS.length - 1;

function empty() { return { v: 1, items: {}, supprimes: {} }; }

const listeners = new Set();
let state = load();

// Identifiant d'un mot : le japonais sans furigana (un même mot venu de deux applis n'apparaît qu'une fois).
export const idOf = jp => String(jp ?? '').replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1').replace(/\*\*|==/g, '').trim();

// Réponses : `log` = [[horodatage, 1 (juste) | 0 (faux)], …]. Les stats en sont déduites,
// ce qui permet de fusionner deux appareils sans compter deux fois la même réponse.
function recompute(it) {
  const seen = new Set();
  const log = [];
  for (const r of it.log || []) {
    const k = `${r[0]}:${r[1]}`;
    if (!seen.has(k)) { seen.add(k); log.push([+r[0], r[1] ? 1 : 0]); }
  }
  log.sort((a, b) => a[0] - b[0]);
  const base = { vu: 0, juste: 0, faux: 0, ...(it.base || {}) };
  for (const [, ok] of log.splice(0, Math.max(0, log.length - MAX_LOG))) {
    base.vu++;
    if (ok) base.juste++; else base.faux++;
  }
  let boite = 0;
  let serie = 0;
  let juste = base.juste;
  for (const [, ok] of log) {
    if (ok) { boite = Math.min(boite + 1, MAX_BOX); serie++; juste++; } else { boite = 0; serie = 0; }
  }
  const vu = base.vu + log.length;
  const dernier = log.length ? log.at(-1)[0] : 0;
  return {
    ...it,
    log,
    base,
    stats: { vu, juste, faux: vu - juste, serie, boite, prochain: dernier ? dernier + INTERVALS[boite] * DAY : 0, dernier },
  };
}

function normItem(x) {
  if (!x || typeof x !== 'object' || !x.jp) return null;
  const id = x.id || idOf(x.jp);
  return recompute({
    ...x, // champs inconnus de cette version (ajoutés par une version plus récente) : gardés
    id,
    jp: String(x.jp),
    kana: String(x.kana || ''),
    fr: String(x.fr || ''),
    app: [...new Set([].concat(x.app || []).filter(Boolean))],
    src: String(x.src || ''),
    at: +x.at || 0,
    log: Array.isArray(x.log) ? x.log : [],
    base: x.base,
  });
}

function normalize(s) {
  const out = empty();
  if (!s || typeof s !== 'object' || Array.isArray(s)) return out;
  for (const [k, v] of Object.entries(s)) if (!(k in out)) out[k] = v; // champs inconnus : gardés
  for (const [id, x] of Object.entries(s.items || {})) {
    const it = normItem({ ...x, id });
    if (it) out.items[id] = it;
  }
  for (const [id, t] of Object.entries(s.supprimes || {})) if (+t) out.supprimes[id] = +t;
  return out;
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return empty(); } // stockage indisponible
  if (!raw) return empty();
  try {
    return normalize(JSON.parse(raw));
  } catch {
    // Liste illisible : on la met de côté (une seule fois) au lieu de l'écraser à la prochaine sauvegarde.
    try { if (!localStorage.getItem(`${KEY}:secours`)) localStorage.setItem(`${KEY}:secours`, raw); } catch { /* ignore */ }
    return empty();
  }
}

function persist(meta = {}) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach(f => f(meta));
}

// Une autre page de la même origine (une autre appli ouverte) a modifié la liste.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    state = load();
    listeners.forEach(f => f({ fromStorage: true }));
  });
}

export const get = () => state;
export const onChange = f => { listeners.add(f); };
export const has = id => !!state.items[id];
export const list = () => Object.values(state.items);

export function replace(next, meta = {}) {
  state = normalize(next);
  persist(meta);
}

// Ajoute un mot. Renvoie false s'il y est déjà.
export function add({ jp, kana = '', fr = '', app = '', src = '' }) {
  const id = idOf(jp);
  if (!id || state.items[id]) return false;
  state.items[id] = normItem({ id, jp, kana, fr, app, src, at: Date.now() });
  persist();
  return true;
}

// Le seul moyen de sortir un mot de la liste : on garde une trace pour qu'il ne revienne pas d'un autre appareil.
export function remove(id) {
  if (!state.items[id]) return;
  delete state.items[id];
  state.supprimes[id] = Date.now();
  persist();
}

export function record(id, ok) {
  const it = state.items[id];
  if (!it) return;
  state.items[id] = recompute({ ...it, log: [...it.log, [Date.now(), ok ? 1 : 0]] });
  persist();
}

export const isDue = (it, now = Date.now()) => it.stats.prochain <= now;
export const dueCount = () => list().filter(it => isDue(it)).length;

// Fusion de deux listes (appareil local + Gist) :
// - un mot retiré (trace dans `supprimes`) ne revient pas, sauf s'il a été rajouté après ;
// - on garde l'ajout le plus ancien, la réunion des applis d'origine et des réponses (sans doublon).
export function merge(a, b) {
  a = normalize(a); b = normalize(b);
  const supprimes = { ...a.supprimes };
  for (const [id, t] of Object.entries(b.supprimes)) supprimes[id] = Math.max(supprimes[id] || 0, t);
  const items = {};
  for (const id of new Set([...Object.keys(a.items), ...Object.keys(b.items)])) {
    const versions = [a.items[id], b.items[id]].filter(v => v && !((supprimes[id] || 0) >= v.at));
    if (!versions.length) continue;
    const [x, ...rest] = versions;
    items[id] = rest.reduce((m, y) => recompute({
      ...m,
      ...y, // champs inconnus de cette version : ceux de b (le Gist) l'emportent ; les champs connus sont fixés ci-dessous
      jp: m.jp || y.jp,
      kana: m.kana || y.kana,
      fr: m.fr || y.fr,
      src: m.src || y.src,
      app: [...new Set([...m.app, ...y.app])],
      at: Math.min(m.at, y.at),
      log: [...m.log, ...y.log],
      base: { vu: Math.max(m.base.vu, y.base.vu), juste: Math.max(m.base.juste, y.base.juste), faux: Math.max(m.base.faux, y.base.faux) },
    }), x);
  }
  // Champs inconnus de la liste elle-même : gardés (ceux de b l'emportent).
  const extra = {};
  for (const src of [a, b]) for (const [k, v] of Object.entries(src)) if (!['v', 'items', 'supprimes'].includes(k)) extra[k] = v;
  return { ...extra, v: 1, items, supprimes };
}

// ---------- Export ----------

export const reading = it => (it.kana && it.kana !== idOf(it.jp) ? it.kana : '');

// CSV pour Anki : recto ; verso ; tags (les lignes # sont des réglages d'import d'Anki).
export function toAnki() {
  const q = s => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = list().sort((a, b) => a.at - b.at).map(it => {
    const verso = [reading(it), it.fr].filter(Boolean).join(' — ');
    return [idOf(it.jp), verso, it.app.join(' ')].map(q).join(';');
  });
  return ['#separator:semicolon', '#html:false', '#tags column:3', ...rows].join('\n') + '\n';
}

export function toText() {
  return list().sort((a, b) => a.at - b.at).map(it => [idOf(it.jp), reading(it), it.fr].filter(Boolean).join(' — ')).join('\n');
}

export const toJSON = () => JSON.stringify(state, null, 1);
