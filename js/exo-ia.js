// Challenger — appel à l'IA (Google Gemini, avec la clé de l'utilisateur).
// La clé reste sur l'appareil (localStorage 'nx-ia'), jamais dans le code ni dans le Gist.
// Fournisseur interchangeable : pour passer à un autre (ex. Claude), il suffit d'ajouter une fonction `appeler…`.

const KEY = 'nx-ia';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/';

export function reglages() {
  try { return { fournisseur: 'gemini', cle: '', modele: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { fournisseur: 'gemini', cle: '', modele: '' }; }
}

export function enregistrer(maj) {
  const r = { ...reglages(), ...maj };
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* ignore */ }
  return r;
}

export const aUneCle = () => !!reglages().cle;

// Appels et tokens du jour (sur cet appareil), pour savoir où on en est du quota gratuit.
export function compteurDuJour() {
  const r = reglages();
  const jour = new Date().toISOString().slice(0, 10);
  return r.jour === jour ? { appels: r.appels || 0, tokens: r.tokens || 0 } : { appels: 0, tokens: 0 };
}

function compter(tokens) {
  const jour = new Date().toISOString().slice(0, 10);
  const c = compteurDuJour();
  enregistrer({ jour, appels: c.appels + 1, tokens: c.tokens + (tokens || 0) });
}

// Erreur lisible : `code` = 'cle' | 'quota' | 'reseau' | 'modele' | 'reponse'.
export class ErreurIA extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function requete(url, opts, cle) {
  let r;
  try {
    r = await fetch(url, { ...opts, headers: { 'x-goog-api-key': cle, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  } catch {
    throw new ErreurIA('reseau', navigator.onLine === false ? 'Pas de connexion internet.' : 'Impossible de joindre Google (réseau).');
  }
  if (r.ok) return r.json();
  let detail = '';
  try { detail = (await r.json())?.error?.message || ''; } catch { /* ignore */ }
  if (r.status === 429) throw new ErreurIA('quota', 'Quota gratuit de Gemini atteint pour le moment (réessaie plus tard, ou fais une séance sans IA).');
  if (r.status === 400 && /api key|API_KEY/i.test(detail)) throw new ErreurIA('cle', 'Clé Gemini refusée : vérifie-la dans les réglages.');
  if (r.status === 401 || r.status === 403) throw new ErreurIA('cle', 'Clé Gemini refusée ou sans accès : vérifie-la dans les réglages.');
  if (r.status === 404) throw new ErreurIA('modele', 'Modèle Gemini introuvable : choisis-en un autre dans les réglages.');
  throw new ErreurIA('reponse', `Erreur Gemini ${r.status}${detail ? ` : ${detail}` : ''}`);
}

// Modèles utilisables avec cette clé, le meilleur « Flash » d'abord (les noms changent souvent : on ne les fige pas).
export async function listerModeles(cle) {
  const out = [];
  let page = '';
  for (let k = 0; k < 5; k++) {
    const r = await requete(`${BASE}models?pageSize=200${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, { method: 'GET' }, cle);
    out.push(...(r.models || []));
    if (!r.nextPageToken) break;
    page = r.nextPageToken;
  }
  const texte = out.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')
    && /gemini/i.test(m.name) && !/(tts|image|audio|live|embed|vision|robotics|computer)/i.test(m.name));
  const version = m => parseFloat((m.name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const rang = m => (/flash/i.test(m.name) && !/lite/i.test(m.name) ? 0 : /flash/i.test(m.name) ? 1 : 2) * 10 + (/(preview|exp)/i.test(m.name) ? 1 : 0);
  return texte.sort((a, b) => rang(a) - rang(b) || version(b) - version(a))
    .map(m => ({ nom: m.name, titre: m.displayName || m.name.replace(/^models\//, '') }));
}

// Texte JSON de la réponse (les parties « pensée » sont ignorées), puis objet JS.
function lireJson(r) {
  const c = r?.candidates?.[0];
  const t = (c?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
  if (!t) throw new ErreurIA('reponse', c?.finishReason === 'SAFETY' ? 'Réponse bloquée par Gemini.' : 'Réponse vide de Gemini.');
  try { return JSON.parse(t); } catch { /* texte autour du JSON : on extrait l'objet */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* ignore */ } }
  throw new ErreurIA('reponse', c?.finishReason === 'MAX_TOKENS' ? 'Réponse de Gemini trop longue (coupée).' : 'Réponse de Gemini illisible.');
}

// Un appel : consignes fixes (`systeme`), message de la séance, schéma JSON attendu.
export async function appeler({ systeme, message, schema, maxTokens = 16000 }) {
  const { cle, modele } = reglages();
  if (!cle) throw new ErreurIA('cle', 'Pas de clé Gemini : ajoute-la dans les réglages.');
  const nom = modele || (await listerModeles(cle))[0]?.nom;
  if (!nom) throw new ErreurIA('modele', 'Aucun modèle Gemini disponible pour cette clé.');
  if (!modele) enregistrer({ modele: nom });
  const corps = schemaOk => ({
    systemInstruction: { parts: [{ text: systeme }] },
    contents: [{ role: 'user', parts: [{ text: message }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens, ...(schemaOk ? { responseJsonSchema: schema } : {}) },
  });
  let r;
  try {
    r = await requete(`${BASE}${nom}:generateContent`, { method: 'POST', body: JSON.stringify(corps(true)) }, cle);
  } catch (e) {
    // Schéma refusé par ce modèle : on réessaie une fois sans (le format est aussi décrit dans les consignes).
    if (e.code !== 'reponse' || !/schema/i.test(e.message)) throw e;
    r = await requete(`${BASE}${nom}:generateContent`, { method: 'POST', body: JSON.stringify(corps(false)) }, cle);
  }
  compter(r?.usageMetadata?.totalTokenCount);
  return lireJson(r);
}
