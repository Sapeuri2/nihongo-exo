// Synchronisation de la progression via un Gist GitHub privé.

import * as S from './state.js';
import * as Liste from './liste.js';
import { CONFIG } from './config.js';

const CFG_KEY = CONFIG.syncKey;
const FILE = CONFIG.gistFile;
const API = 'https://api.github.com';
const PUSH_DELAY = 3000;
// « Ma liste » : un Gist commun à toutes les applis (même domaine, donc même localStorage).
const LISTE_FILE = 'nihongo-ma-liste.json';
const LISTE_GIST_KEY = 'nihongo-ma-liste-gist';

let cfg = loadCfg();
let status = { state: cfg ? 'idle' : 'off', at: null, msg: '' };
let running = null;
let again = false;
let timer = null;
const listeners = new Set();

function loadCfg() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch { return null; }
}
function saveCfg() {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
  } catch { /* ignore */ }
}

function setStatus(state, msg = '') {
  status = { state, msg, at: state === 'ok' ? new Date() : status.at };
  listeners.forEach(f => f(status));
}

export function getStatus() { return status; }
export function getConfig() { return cfg; }
export function onStatus(f) { listeners.add(f); }

async function gh(path, opts = {}, token = cfg?.token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { ...opts, headers, cache: 'no-store' });
  if (!r.ok) {
    if (r.status === 401) throw new Error('Clé GitHub invalide ou expirée.');
    if (r.status === 403 || r.status === 404) throw new Error(`Accès refusé par GitHub (${r.status}). La clé a-t-elle le droit « gist » ?`);
    throw new Error(`Erreur GitHub ${r.status}`);
  }
  return r.status === 204 ? null : r.json();
}

export async function connect(token) {
  token = token.trim();
  const user = await gh('/user', {}, token);
  let gistId = null;
  for (let page = 1; page <= 10 && !gistId; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, {}, token);
    const found = list.find(g => g.files && g.files[FILE]);
    if (found) gistId = found.id;
    if (list.length < 100) break;
  }
  if (!gistId) {
    const g = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: CONFIG.gistDescription,
        public: false,
        files: { [FILE]: { content: JSON.stringify(S.get()) } },
      }),
    }, token);
    gistId = g.id;
  }
  cfg = { token, gistId, login: user.login };
  saveCfg();
  await syncNow();
}

export function disconnect() {
  cfg = null;
  saveCfg();
  setStatus('off');
}

// JSON avec les clés triées, pour comparer deux progressions sans faux écarts.
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

async function readRemote() {
  const g = await gh(`/gists/${cfg.gistId}`);
  const file = g.files?.[FILE];
  if (!file) return null;
  let content = file.content;
  if (file.truncated) content = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
  try { return JSON.parse(content); } catch { return null; }
}

async function findGist(file, token = cfg?.token) {
  for (let page = 1; page <= 10; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, {}, token);
    const found = list.find(g => g.files && g.files[file]);
    if (found) return found.id;
    if (list.length < 100) break;
  }
  return null;
}

async function readGistFile(id, file) {
  const g = await gh(`/gists/${id}`);
  const f = g.files?.[file];
  if (!f) return null;
  let content = f.content;
  if (f.truncated) content = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  try { return JSON.parse(content); } catch { return null; }
}

// Ma liste : lit le Gist commun (créé s'il n'existe pas), fusionne, renvoie le résultat si besoin.
async function syncListe() {
  if (CONFIG.listeEnabled === false) return;
  let id = null;
  try { id = localStorage.getItem(LISTE_GIST_KEY); } catch { /* ignore */ }
  let remote = null;
  if (id) {
    try { remote = await readGistFile(id, LISTE_FILE); } catch { id = null; }
    if (!remote) id = null;
  }
  if (!id) {
    id = await findGist(LISTE_FILE);
    if (id) remote = await readGistFile(id, LISTE_FILE);
  }
  const merged = Liste.merge(Liste.get(), remote);
  const mergedJson = canon(merged);
  if (!id) {
    const g = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({ description: 'Ma liste nihongo (ne pas supprimer)', public: false, files: { [LISTE_FILE]: { content: mergedJson } } }),
    });
    id = g.id;
  } else if (mergedJson !== canon(Liste.merge(remote, remote))) {
    await gh(`/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files: { [LISTE_FILE]: { content: mergedJson } } }) });
  }
  try { localStorage.setItem(LISTE_GIST_KEY, id); } catch { /* ignore */ }
  if (mergedJson !== canon(Liste.get())) Liste.replace(merged, { fromSync: true });
}

// Lit le Gist, fusionne avec la progression locale, et renvoie le résultat si besoin.
export async function syncNow() {
  if (!cfg) return;
  if (running) { again = true; return running; }
  if (!navigator.onLine) { setStatus('offline'); return; }
  running = (async () => {
    setStatus('busy');
    try {
      const remote = await readRemote();
      const merged = S.merge(S.get(), remote);
      const mergedJson = canon(merged);
      if (mergedJson !== canon(S.get())) S.replace(merged, { fromSync: true });
      if (!remote || mergedJson !== canon(S.merge(remote, remote))) {
        await gh(`/gists/${cfg.gistId}`, {
          method: 'PATCH',
          body: JSON.stringify({ files: { [FILE]: { content: mergedJson } } }),
        });
      }
      await syncListe();
      setStatus('ok');
    } catch (e) {
      setStatus(navigator.onLine ? 'error' : 'offline', e.message);
    }
  })();
  try { await running; } finally {
    running = null;
    if (again) { again = false; syncNow(); }
  }
}

export function schedule() {
  if (!cfg) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, PUSH_DELAY);
}

export function init() {
  document.addEventListener('visibilitychange', () => {
    // En quittant l'appli (ex. téléphone mis en veille), on envoie tout de suite.
    clearTimeout(timer);
    syncNow();
  });
  window.addEventListener('online', () => syncNow());
  syncNow();
}
