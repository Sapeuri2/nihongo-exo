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

// Question à trous : chaque trou est vérifié à part. 'ok' si tous sont justes ; 'doute' si aucun n'est faux mais
// une réponse libre diffère de celles prévues ; 'faux' sinon. `detail` : le résultat de chaque trou.
export function verifierTrous(tapes, q) {
  const detail = q.trous.map((t, i) => verifierSaisie(tapes[i] ?? '', t));
  const res = detail.includes('faux') ? 'faux' : detail.includes('doute') ? 'doute' : 'ok';
  return { res, detail };
}

// Marqueurs des trous dans la phrase : ① ② ③ …
export const MARQUES = '①②③④⑤⑥';

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
  } else if (q.type === 'trous') {
    const trous = Array.isArray(x.trous) ? x.trous.map(t => ({
      indication: texte(t?.indication),
      reponses: Array.isArray(t?.reponses) ? t.reponses.map(texte).filter(Boolean) : [],
      script: t?.script === 'libre' ? 'libre' : 'kana',
    })) : [];
    if (trous.length < 2 || trous.length > MARQUES.length || trous.some(t => !t.reponses.length)) return null;
    // Chaque trou est marqué dans la phrase (①, ②…) ou porte une indication (ex. « 読み：森 ») ; pas de marque en trop.
    const marques = [...q.jp].filter(c => MARQUES.includes(c));
    if (new Set(marques).size !== marques.length || marques.some(m => MARQUES.indexOf(m) >= trous.length)) return null;
    if (trous.some((t, i) => !q.jp.includes(MARQUES[i]) && !t.indication)) return null;
    Object.assign(q, { trous });
  } else if (q.type === 'ordre') {
    const morceaux = Array.isArray(x.morceaux) ? x.morceaux.map(texte).filter(Boolean) : [];
    if (morceaux.length < 3 || morceaux.length > 8) return null;
    Object.assign(q, { morceaux });
  } else return null;
  for (const k of ['consigne', 'jp', 'fr', 'explication']) if (!furiganaOk(q[k])) return null;
  if (consigneDonneReponse(q)) return null;
  for (const c of [...(q.choix || []), ...(q.reponses || []), ...(q.morceaux || []), ...(q.trous || []).flatMap(t => [t.indication, ...t.reponses])]) if (!furiganaOk(c)) return null;
  return q;
}

// La consigne ne doit pas donner la réponse : réponse attendue écrite dedans, ou lecture en kana entre parenthèses.
export function consigneDonneReponse(q) {
  const c = normaliser(q.consigne, 'libre');
  // (Les mots « ひらがな », « カタカナ », « かな » entre parenthèses indiquent l'écriture attendue : permis.)
  const kanaEntreParentheses = [...sansFurigana(q.consigne).matchAll(/[（(]([\u3040-\u30ff・ー]+)[)）]/g)].map(m => m[1]);
  if (kanaEntreParentheses.some(k => !/^(ひらがな|カタカナ|かな|カナ)$/.test(k))) return true;
  if ((q.type === 'saisie' || q.type === 'trous') && formeNommee(q.consigne)) return true;
  const trous = q.trous || [];
  const attendues = q.type === 'choix' ? [q.choix[q.bonne]] : q.type === 'saisie' ? q.reponses : trous.flatMap(t => t.reponses);
  // Pour un trou, ni la consigne ni son indication ne doivent contenir la réponse.
  const textes = [c, ...trous.map(t => normaliser(t.indication, 'libre'))];
  return attendues.some(r => { const a = normaliser(r, 'libre'); return a.length > 0 && /[\u3040-\u30ff\u3400-\u9fff]/.test(a) && textes.some(x => x.includes(a)); });
}

// La consigne nomme la forme grammaticale à produire (« forme て », « mets à la forme ている », « ない形 »…) :
// c'est à lui de choisir la forme d'après le sens. (Les formes en choix multiples restent permises.)
export function formeNommee(consigne) {
  const c = sansFurigana(consigne);
  return /forme\s*(en\s*|du\s*|de\s*)?[«"“]?\s*[〜~～]?[\u3040-\u30ff]/i.test(c)
    || /(て|た|ない|ます|辞書|可能|意向|受け?身|使役|条件|命令|ば)\s*形/.test(c)
    || /\b(au|à l['’]|en)\s*(passé|négatif|potentiel|volitif|passif|causatif|conditionnel|impératif)/i.test(c);
}

// ---------- Choix des cibles d'une séance ----------

// Répartition d'une séance de `taille` questions : reprises (déjà vues, à revoir), nouveautés (pas encore vues),
// leçons choisies par lui pour cette séance (`focus`, s'il en a choisi), une part fixe de grammaire, le reste partagé
// entre ce qui est épinglé (⭐ leçons, 📌 mots : insistance) et toutes ses autres leçons déjà faites.
export function quotas(taille, parts, nbReprisesDispo, { focus = false } = {}) {
  const reprise = Math.min(nbReprisesDispo, Math.round(taille * parts.reprise));
  const nouveau = Math.round(taille * parts.nouveau * (focus ? 0.5 : 1));
  const reste = taille - reprise - nouveau;
  const choisies = focus ? Math.round(reste * 0.65) : 0;
  const grammaire = Math.round((reste - choisies) * (parts.grammaire || 0));
  const autres = reste - choisies - grammaire;
  const epingle = Math.round(autres * 0.45);
  return { reprise, nouveau, choisies, grammaire, epingle, niveau: autres - epingle, saisie: Math.round((taille - reprise) * parts.saisie), trous: parts.trous || 0 };
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

// Tire `n` leçons au hasard, chacune avec une chance proportionnelle à son poids (sans remise) :
// les leçons faibles ou anciennes reviennent plus souvent, mais toutes finissent par revenir.
export function tirerPondere(lecons, poids, n, alea = Math.random) {
  const reste = lecons.map(l => [l, Math.max(0.01, poids(l))]);
  const out = [];
  while (out.length < n && reste.length) {
    const total = reste.reduce((t, [, p]) => t + p, 0);
    let r = alea() * total;
    let i = 0;
    while (i < reste.length - 1 && (r -= reste[i][1]) > 0) i++;
    out.push(reste.splice(i, 1)[0][0]);
  }
  return out;
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

// ---------- Crédit Claude (synchronisé : PC et téléphone voient le même reste) ----------
// credit = { achats: { id: { montant, t } }, depenses: { appareil: { total, appels, t } }, correction: { solde, t, depensesA } }
// Chaque appareil n'augmente que son propre compteur : la fusion garde le plus grand ; la correction la plus récente gagne.

const somme = o => Object.values(objet(o)).reduce((s, x) => s + (+x?.total || 0), 0);

export function fusionCredit(a, b) {
  const x = objet(a);
  const y = objet(b);
  const depenses = { ...objet(x.depenses) };
  for (const [k, v] of Object.entries(objet(y.depenses))) if (!depenses[k] || (+v?.total || 0) > (+depenses[k].total || 0)) depenses[k] = v;
  const cx = x.correction?.t || 0;
  const cy = y.correction?.t || 0;
  const out = { achats: { ...objet(x.achats), ...objet(y.achats) }, depenses };
  const correction = cy > cx ? y.correction : x.correction;
  if (correction) out.correction = correction;
  return out;
}

export function ajouterAchat(credit, montant, t = Date.now()) {
  const c = objet(credit);
  return { ...c, achats: { ...objet(c.achats), [`a${t.toString(36)}`]: { montant: +montant, t } } };
}

export function ajouterDepense(credit, appareil, cout, t = Date.now(), depart = 0) {
  const c = objet(credit);
  const d = objet(c.depenses)[appareil] || { total: depart, appels: 0 };
  return { ...c, depenses: { ...objet(c.depenses), [appareil]: { total: (+d.total || 0) + cout, appels: (d.appels || 0) + 1, t } } };
}

// Le vrai solde lu sur la Console : le compte repart de là.
export function corrigerCredit(credit, solde, t = Date.now()) {
  const c = objet(credit);
  return { ...c, correction: { solde: +solde, t, depensesA: somme(c.depenses) } };
}

// Ce qui reste (en $), ce qui a été dépensé, et le coût moyen d'une séance (2 appels) ; null si aucun crédit saisi.
export function resteCredit(credit) {
  const c = objet(credit);
  const depense = somme(c.depenses);
  const achats = Object.values(objet(c.achats));
  const appels = Object.values(objet(c.depenses)).reduce((s, x) => s + (x?.appels || 0), 0);
  const parSeance = appels >= 2 ? (depense / appels) * 2 : null;
  let reste;
  if (c.correction) reste = c.correction.solde + achats.filter(a => a.t > c.correction.t).reduce((s, a) => s + a.montant, 0) - (depense - (c.correction.depensesA || 0));
  else if (achats.length) reste = achats.reduce((s, a) => s + a.montant, 0) - depense;
  else return null;
  return { reste, depense, parSeance };
}
