// Challenger — fonctions sans affichage (testables dans Node) : réponses tapées, contrôle des questions
// reçues de l'IA, choix des cibles d'une séance, fusion des données entre appareils.

const DAY = 86400000;

// ---------- Réponses tapées ----------

const sansFurigana = s => String(s ?? '').replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1');
const versHiragana = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

// Forme comparable d'une réponse : sans furigana ni balisage, sans espaces ni ponctuation finale,
// en pleine/demi-chasse unifiées ; en « kana », katakana et hiragana sont confondus.
export function normaliser(s, script = 'kana') {
  let t = sansFurigana(s).replace(/\*\*|==/g, '').normalize('NFKC').toLowerCase();
  t = t.replace(/[\s　]+/g, '').replace(/[。.．!！?？、,]+$/u, '');
  if (script === 'kana') t = versHiragana(t);
  return t;
}

// 'ok' si la réponse tapée est acceptée ; 'faux' sinon ; 'doute' pour une réponse libre (traduction)
// différente de celles prévues : l'IA la jugera au bilan.
export function verifierSaisie(tape, q) {
  const t = normaliser(tape, q.script);
  if (!t) return 'faux';
  const ok = (q.reponses || []).some(r => normaliser(r, q.script) === t);
  if (ok) return 'ok';
  return q.script === 'libre' ? 'doute' : 'faux';
}

// ---------- Questions reçues de l'IA ----------

const texte = v => (typeof v === 'string' ? v.trim() : '');
const furiganaOk = s => !/[{}|]/.test(String(s).replace(/\{[^|{}]+\|[^{}]+\}/g, ''));

// Renvoie une question propre, ou null si elle est inutilisable (on la jette sans redemander à l'IA).
export function validerQuestion(x) {
  if (!x || typeof x !== 'object') return null;
  const q = {
    type: x.type,
    cible: texte(x.cible),
    style: texte(x.style),
    consigne: texte(x.consigne),
    jp: texte(x.jp),
    fr: texte(x.fr),
    explication: texte(x.explication),
    intention: texte(x.intention),
  };
  if (!q.consigne && !q.jp) return null;
  if (q.type === 'choix') {
    const choix = Array.isArray(x.choix) ? x.choix.map(texte).filter(Boolean) : [];
    if (choix.length < 3 || choix.length > 5) return null;
    if (new Set(choix.map(c => sansFurigana(c))).size !== choix.length) return null; // deux choix identiques
    if (!Number.isInteger(x.bonne) || x.bonne < 0 || x.bonne >= choix.length) return null;
    Object.assign(q, { choix, bonne: x.bonne });
  } else if (q.type === 'saisie') {
    const reponses = Array.isArray(x.reponses) ? x.reponses.map(texte).filter(Boolean) : [];
    if (!reponses.length) return null;
    Object.assign(q, { reponses, script: x.script === 'libre' ? 'libre' : 'kana' });
  } else if (q.type === 'ordre') {
    const morceaux = Array.isArray(x.morceaux) ? x.morceaux.map(texte).filter(Boolean) : [];
    if (morceaux.length < 3 || morceaux.length > 8) return null;
    Object.assign(q, { morceaux });
  } else return null;
  for (const k of ['consigne', 'jp', 'fr', 'explication']) if (!furiganaOk(q[k])) return null;
  if (consigneDonneReponse(q)) return null;
  for (const c of [...(q.choix || []), ...(q.reponses || []), ...(q.morceaux || [])]) if (!furiganaOk(c)) return null;
  return q;
}

// La consigne ne doit pas donner la réponse : réponse attendue écrite dedans, ou lecture en kana entre parenthèses.
export function consigneDonneReponse(q) {
  const c = normaliser(q.consigne, 'libre');
  // (Les mots « ひらがな », « カタカナ », « かな » entre parenthèses indiquent l'écriture attendue : permis.)
  const kanaEntreParentheses = [...sansFurigana(q.consigne).matchAll(/[（(]([\u3040-\u30ff・ー]+)[)）]/g)].map(m => m[1]);
  if (kanaEntreParentheses.some(k => !/^(ひらがな|カタカナ|かな|カナ)$/.test(k))) return true;
  const attendues = q.type === 'choix' ? [q.choix[q.bonne]] : q.type === 'saisie' ? q.reponses : [];
  return attendues.some(r => { const a = normaliser(r, 'libre'); return a.length > 0 && /[\u3040-\u30ff\u3400-\u9fff]/.test(a) && c.includes(a); });
}

// ---------- Choix des cibles d'une séance ----------

// Répartition d'une séance de `taille` questions : reprises (déjà vues, à revoir), nouveautés (pas encore vues),
// une part fixe de grammaire (⭐ de grammaire d'abord), le reste partagé entre ce qui est épinglé (⭐ leçons, 📌 mots)
// et le niveau en cours.
export function quotas(taille, parts, nbReprisesDispo) {
  const reprise = Math.min(nbReprisesDispo, Math.round(taille * parts.reprise));
  const nouveau = Math.round(taille * parts.nouveau);
  const reste = taille - reprise - nouveau;
  const grammaire = Math.round(reste * (parts.grammaire || 0));
  const autres = reste - grammaire;
  const epingle = Math.round(autres * 0.55);
  return { reprise, nouveau, grammaire, epingle, niveau: autres - epingle, saisie: Math.round((taille - reprise) * parts.saisie) };
}

// Questions déjà posées par le Challenger à reprendre : d'abord celles à revoir (ratées, échéance passée).
export function reprises(banque, items, now = Date.now()) {
  return Object.keys(banque)
    .filter(id => items[id] && (items[id].due <= now || items[id].box === 0))
    .sort((a, b) => items[a].box - items[b].box || items[a].due - items[b].due);
}

// Poids d'une leçon faite : plus elle a été ratée et plus elle est ancienne, plus elle doit revenir.
export function poidsLecon(stat, now = Date.now()) {
  const jours = stat.t ? (now - stat.t) / DAY : 30;
  return 1 + Math.min(stat.ko || 0, 6) + Math.min(jours / 7, 4) + (stat.dues || 0) * 0.5;
}

// ---------- Fusion entre appareils (champs propres au Challenger dans la progression) ----------

const objet = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Banque des questions écrites par l'IA : réunion des deux appareils (une question ne change jamais).
export function fusionBanque(a, b) {
  return { ...objet(a), ...objet(b) };
}

// Carnet (ce que l'IA a retenu des difficultés) : le plus récent l'emporte.
export function fusionCarnet(a, b) {
  const x = objet(a);
  const y = objet(b);
  return (y.t || 0) > (x.t || 0) ? y : x;
}

// Bilans des séances : réunion, les 20 plus récents gardés.
export function fusionBilans(a, b) {
  const tous = { ...objet(a), ...objet(b) };
  return Object.fromEntries(Object.entries(tous).sort((x, y) => (y[1].t || 0) - (x[1].t || 0)).slice(0, 20));
}

// Garde la banque sous `max` questions : on retire d'abord les plus maîtrisées, puis les plus anciennes.
export function elaguerBanque(banque, items, max) {
  const ids = Object.keys(banque);
  if (ids.length <= max) return banque;
  const score = id => (items[id]?.box ?? 0) * 1e13 - (banque[id].t || 0);
  const garder = new Set(ids.sort((a, b) => score(a) - score(b)).slice(0, max));
  return Object.fromEntries(Object.entries(banque).filter(([id]) => garder.has(id)));
}
