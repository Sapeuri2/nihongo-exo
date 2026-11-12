// Challenger — appel à l'IA, avec la clé de l'utilisateur : Google Gemini (gratuit) ou Claude (payant, crédits Console).
// Les clés restent sur l'appareil (localStorage 'nx-ia'), jamais dans le code ni dans le Gist.
// 'nx-ia' : { fournisseur: 'gemini'|'claude', cle, modele (Gemini), cleClaude, modeleClaude,
//             jour, appels, tokens, cout (du jour, $), coutTotal ($, Claude) } — anciens champs inchangés.

const KEY = 'nx-ia';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/';
const CLAUDE = 'https://api.anthropic.com/v1/';
const CLAUDE_VERSION = '2026-10-21';

// Modèles Claude proposés, avec leur prix ($ par million de tokens : entrée, sortie) pour afficher le coût.
export const MODELES_CLAUDE = [
  { nom: 'claude-sonnet-5-5', titre: 'Claude Sonnet 5.5 (conseillé)', prix: [2, 10] },
  { nom: 'claude-haiku-5-5', titre: 'Claude Haiku 5.5 (le moins cher)', prix: [0.1, 0.5] },
  { nom: 'claude-opus-5-5', titre: 'Claude Opus 5.5 (le meilleur, 2× plus cher)', prix: [4, 20] },
];
const DEFAUT = { fournisseur: 'gemini', cle: '', modele: '', cleClaude: '', modeleClaude: MODELES_CLAUDE[0].nom };

export function reglages() {
  try { return { ...DEFAUT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAUT }; }
}

export function enregistrer(maj) {
  const r = { ...reglages(), ...maj };
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* ignore */ }
  return r;
}

export const estClaude = (r = reglages()) => r.fournisseur === 'claude';
export const aUneCle = () => { const r = reglages(); return !!(estClaude(r) ? r.cleClaude : r.cle); };
export const nomIA = (r = reglages()) => (estClaude(r) ? 'Claude' : 'Gemini');

// Nom lisible du modèle utilisé.
export function modeleActuel(r = reglages()) {
  if (estClaude(r)) return (MODELES_CLAUDE.find(m => m.nom === r.modeleClaude) || MODELES_CLAUDE[0]).titre.replace(/ \(.*\)$/, '');
  return r.modele ? r.modele.replace(/^models\//, '') : '';
}

// Appels, tokens et coût du jour (sur cet appareil) ; coût total de Claude depuis le début.
export function compteurDuJour() {
  const r = reglages();
  const jour = new Date().toISOString().slice(0, 10);
  const c = r.jour === jour ? { appels: r.appels || 0, tokens: r.tokens || 0, cout: r.cout || 0 } : { appels: 0, tokens: 0, cout: 0 };
  return { ...c, coutTotal: r.coutTotal || 0 };
}

function compter(tokens, cout = 0) {
  const jour = new Date().toISOString().slice(0, 10);
  const c = compteurDuJour();
  enregistrer({ jour, appels: c.appels + 1, tokens: c.tokens + (tokens || 0), cout: c.cout + cout, coutTotal: c.coutTotal + cout });
  if (cout) ecouteursCout.forEach(f => f(cout));
}

// Coût de chaque appel payant : la séance l'ajoute au crédit synchronisé (exo-seance).
const ecouteursCout = new Set();
export const onCout = f => { ecouteursCout.add(f); };

// Identifiant de cet appareil (pour le compteur de dépenses synchronisé), gardé sur l'appareil.
export function appareil() {
  let id = reglages().appareil;
  if (!id) { id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; enregistrer({ appareil: id }); }
  return id;
}

export const dollars = x => `${x < 0.01 && x > 0 ? x.toFixed(3) : x.toFixed(2)} $`.replace('.', ',');

// Erreur lisible : `code` = 'cle' | 'quota' | 'credit' | 'reseau' | 'modele' | 'reponse'.
export class ErreurIA extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------- Gemini ----------

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

// Texte JSON d'une réponse (avec ou sans texte autour), puis objet JS.
function jsonDe(t, coupe, qui) {
  try { return JSON.parse(t); } catch { /* texte autour du JSON : on extrait l'objet */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* ignore */ } }
  throw new ErreurIA('reponse', coupe ? `Réponse de ${qui} trop longue (coupée).` : `Réponse de ${qui} illisible.`);
}

function lireJson(r) {
  const c = r?.candidates?.[0];
  const t = (c?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
  if (!t) throw new ErreurIA('reponse', c?.finishReason === 'SAFETY' ? 'Réponse bloquée par Gemini.' : 'Réponse vide de Gemini.');
  return jsonDe(t, c?.finishReason === 'MAX_TOKENS', 'Gemini');
}

async function appelerGemini({ systeme, message, schema, maxTokens }) {
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

// ---------- Claude (API Anthropic, appelée directement depuis le navigateur) ----------

async function requeteClaude(chemin, opts, cle) {
  let r;
  try {
    r = await fetch(CLAUDE + chemin, {
      ...opts,
      headers: {
        'x-api-key': cle,
        'anthropic-version': CLAUDE_VERSION,
        // Appel direct depuis la page (pas de serveur) : la clé est celle de l'utilisateur, sur son appareil.
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
    });
  } catch {
    throw new ErreurIA('reseau', navigator.onLine === false ? 'Pas de connexion internet.' : 'Impossible de joindre Claude (réseau).');
  }
  if (r.ok) return r.json();
  let detail = '';
  try { detail = (await r.json())?.error?.message || ''; } catch { /* ignore */ }
  if (/credit balance|billing|credits?/i.test(detail) && (r.status === 400 || r.status === 402 || r.status === 403)) {
    throw new ErreurIA('credit', 'Crédits Claude épuisés : recharge sur console.anthropic.com, ou passe à Gemini dans les réglages.');
  }
  if (r.status === 401 || r.status === 403) throw new ErreurIA('cle', 'Clé Claude refusée : vérifie-la dans les réglages.');
  if (r.status === 404) throw new ErreurIA('modele', 'Modèle Claude introuvable : choisis-en un autre dans les réglages.');
  if (r.status === 429) throw new ErreurIA('quota', 'Trop de demandes à Claude pour le moment : réessaie dans une minute.');
  if (r.status === 529 || r.status === 503) throw new ErreurIA('reponse', 'Claude est surchargé pour le moment : réessaie dans un instant.');
  throw new ErreurIA('reponse', `Erreur Claude ${r.status}${detail ? ` : ${detail}` : ''}`);
}

// Vérifie une clé Claude sans rien dépenser (liste des modèles).
export async function testerCleClaude(cle) {
  const r = await requeteClaude('models?limit=100', { method: 'GET' }, cle);
  return (r.data || []).map(m => m.id);
}

// Les sorties structurées de Claude demandent « additionalProperties: false » sur chaque objet du schéma.
export function schemaClaude(s) {
  if (Array.isArray(s)) return s.map(schemaClaude);
  if (!s || typeof s !== 'object') return s;
  const out = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'properties' ? Object.fromEntries(Object.entries(v).map(([p, x]) => [p, schemaClaude(x)])) : schemaClaude(v)]));
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

// Coût d'un appel en dollars, d'après le modèle qui a vraiment répondu.
export function coutClaude(usage, modele) {
  const m = MODELES_CLAUDE.find(x => String(modele || '').startsWith(x.nom)) || MODELES_CLAUDE[0];
  const entree = (usage?.input_tokens || 0) + (usage?.cache_creation_input_tokens || 0) * 1.25 + (usage?.cache_read_input_tokens || 0) * 0.1;
  return (entree * m.prix[0] + (usage?.output_tokens || 0) * m.prix[1]) / 1e6;
}

async function appelerClaudeIA({ systeme, message, schema, maxTokens }) {
  const { cleClaude, modeleClaude } = reglages();
  if (!cleClaude) throw new ErreurIA('cle', 'Pas de clé Claude : ajoute-la dans les réglages.');
  const corps = {
    model: modeleClaude || MODELES_CLAUDE[0].nom,
    max_tokens: maxTokens,
    system: systeme,
    messages: [{ role: 'user', content: message }],
    // Effort bas : peu de réflexion facturée ; JSON imposé par le schéma.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaClaude(schema) } },
  };
  const r = await requeteClaude('messages', { method: 'POST', body: JSON.stringify(corps) }, cleClaude);
  compter((r?.usage?.input_tokens || 0) + (r?.usage?.output_tokens || 0), coutClaude(r?.usage, r?.model || corps.model));
  if (r?.stop_reason === 'refusal') throw new ErreurIA('reponse', 'Claude a refusé de répondre à cette demande.');
  const t = (r?.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('').trim();
  if (!t) throw new ErreurIA('reponse', 'Réponse vide de Claude.');
  return jsonDe(t, r?.stop_reason === 'max_tokens', 'Claude');
}

// ---------- Un appel, au fournisseur choisi : consignes fixes (`systeme`), message de la séance, schéma JSON attendu ----------

export async function appeler({ systeme, message, schema, maxTokens = 16000 }) {
  return estClaude() ? appelerClaudeIA({ systeme, message, schema, maxTokens }) : appelerGemini({ systeme, message, schema, maxTokens });
}
