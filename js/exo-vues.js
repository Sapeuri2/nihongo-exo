// Challenger — écrans : accueil, séance, bilan, réglages.

import { esc, rich, richBlank } from './text.js';
import * as S from './state.js';
import * as L from './liste.js';
import * as Sync from './sync.js';
import { CONFIG } from './config.js';
import { APPS, progression, urlAppli } from './exo-sources.js';
import * as IA from './exo-ia.js';
import * as X from './exo-seance.js';

const pct = x => `${Math.round(x * 100)} %`;
const date = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// ---------- Accueil ----------

export function vueAccueil() {
  const s = X.get();
  let h = '';
  if (s && !s.fin) {
    h += `<section class="card resume"><div><h2>Séance en cours</h2><p class="muted small">question ${Math.min(s.idx + 1, s.file.length)}/${Math.max(s.file.length, CONFIG.seanceTaille)}</p></div>
      <div class="actions left"><button class="btn primary" data-act="reprendre">Reprendre</button><button class="btn" data-act="abandonner">Abandonner</button></div></section>`;
  } else if (s?.fin) {
    h += `<section class="card resume"><div><h2>Bilan à faire</h2><p class="muted small">${s.bilanErreur ? esc(s.bilanErreur) : 'La séance est finie : il reste le bilan de tes erreurs.'}</p></div>
      <div class="actions left"><button class="btn primary" data-act="bilan">Faire le bilan</button><button class="btn" data-act="bilan-sans-ia">Bilan sans IA</button></div></section>`;
  }
  const cle = IA.aUneCle();
  const c = IA.compteurDuJour();
  h += `<section class="hero exo-hero"><button class="btn primary big" data-act="demarrer" ${s ? 'disabled' : ''}>Lancer une séance<small>${CONFIG.seanceTaille} questions${cle ? ' écrites par l’IA' : ' (exercices de tes applis)'}</small></button>
    <button class="btn" data-act="demarrer-sans-ia" ${s ? 'disabled' : ''}>Sans IA<small>exercices de tes applis, sans coût</small></button></section>`;
  h += `<p class="muted small ia-etat">${cle ? `IA : Gemini${IA.reglages().modele ? ` (${esc(IA.reglages().modele.replace(/^models\//, ''))})` : ''} · aujourd’hui : ${c.appels} appel${c.appels > 1 ? 's' : ''}` : 'Pas encore de clé IA : <a href="#/reglages">ajoute ta clé Gemini</a> pour des questions écrites pour toi.'}</p>`;

  const etoiles = APPS.reduce((n, a) => n + Object.values(progression(a)?.etoiles || {}).filter(e => e?.on).length, 0);
  h += `<section class="card"><h2>Ce que je vais te faire travailler</h2><ul class="exo-cibles">
    <li><span>⭐</span> ${etoiles} leçon${etoiles > 1 ? 's' : ''} étoilée${etoiles > 1 ? 's' : ''} <span class="muted small">(en priorité)</span></li>
    <li><span>📌</span> ${L.list().length} mot${L.list().length > 1 ? 's' : ''} de Ma liste</li>
    <li><span>📚</span> les leçons déjà faites de ton niveau en cours</li>
    <li><span>✨</span> ${pct(CONFIG.partNouveau)} de nouveautés du JLPT de ton niveau</li>
    <li><span>🔁</span> ${X.aRevoir()} question${X.aRevoir() > 1 ? 's' : ''} déjà ratée${X.aRevoir() > 1 ? 's' : ''} ou à revoir</li></ul></section>`;

  const cn = X.carnet();
  if (cn?.texte) h += `<details class="card carnet"><summary><h2>📓 Mon carnet</h2><span class="muted small">écrit par l’IA, ${date(cn.t)}</span></summary><p>${esc(cn.texte)}</p></details>`;
  const bl = X.bilans();
  if (bl.length) {
    h += `<section class="card"><h2>Derniers bilans</h2><ul class="steps">${bl.slice(0, 8).map(b => `<li><a class="bilan-lien" href="#/bilan/${esc(b.id)}"><span>${date(b.t)}</span><span class="score">${b.score.ok}/${b.score.total}</span></a></li>`).join('')}</ul></section>`;
  }
  return h;
}

// ---------- Séance ----------

export function vueSeance() {
  const s = X.get();
  if (!s) return null;
  if (s.fin) {
    if (s.bilanErreur) return `<section class="card"><h2>Bilan</h2><p>${esc(s.bilanErreur)}</p><div class="actions"><button class="btn primary" data-act="bilan">Réessayer</button><button class="btn" data-act="bilan-sans-ia">Bilan sans IA</button></div></section>`;
    return '<section class="attente"><div class="sablier">⏳</div><p>L’IA prépare le bilan de tes erreurs…</p></section>';
  }
  const q = X.question();
  const total = Math.max(s.file.length, CONFIG.seanceTaille);
  let h = `<div class="sess-top"><button class="link" data-act="abandonner">✕</button><div class="progress"><span style="width:${(s.idx / total) * 100}%"></span></div><span class="count">${Math.min(s.idx + 1, total)}/${total}</span></div>`;
  if (s.gen === 'attente' && q) h += '<p class="muted small bandeau">⏳ L’IA écrit tes questions… tu commences par celles à revoir.</p>';
  if (s.gen === 'echec') h += `<div class="bandeau erreur"><p>L’IA n’a pas pu écrire les questions : ${esc(s.genErreur)}</p><div class="actions left"><button class="btn" data-act="regenerer">Réessayer</button><button class="btn" data-act="sans-ia">Continuer sans IA</button></div></div>`;
  if (s.strategie && s.idx < 2) h += `<p class="strategie">🎯 ${esc(s.strategie)}</p>`;
  if (!q) {
    if (s.gen === 'attente') h += '<section class="attente"><div class="sablier">⏳</div><p>L’IA prépare tes questions…</p><p class="muted small">La première fois, ça peut prendre une minute.</p><button class="btn" data-act="sans-ia">Commencer sans IA</button></section>';
    return h;
  }
  X.initCourante();
  const cur = s.cur;
  const pos = s.file[s.idx];
  h += `<p class="muted sess-title">${esc(q.style || (q.source === 'cours' ? 'Exercice' : 'Challenger'))}${pos.essai ? ' · <em>elle revient !</em>' : ''}</p>`;
  h += `<div class="exercise exo-q" data-id="${esc(q.id)}" data-type="${q.type}">`;
  h += `<p class="instr">${rich(q.consigne)}</p>`;
  const rempli = cur.repondu && q.type === 'choix' ? q.choix[q.bonne] : cur.repondu && q.type === 'saisie' ? q.reponses[0] : null;
  if (q.jp && q.type !== 'ordre') h += `<p class="jp big">${q.jp.includes('＿') ? richBlank(q.jp, rempli) : rich(q.jp)}</p>`;
  // Remise en ordre : la traduction sert d'énoncé, sauf si la consigne la contient déjà (pas deux fois).
  const frDansConsigne = q.fr && q.consigne.replace(/[«»"“”\s.]/g, '').includes(q.fr.replace(/[«»"“”\s.]/g, ''));
  if (q.type === 'ordre' && q.fr && !frDansConsigne) h += `<p class="fr big-fr">${rich(q.fr)}</p>`;
  else if (q.fr && cur.repondu) h += `<p class="fr">${rich(q.fr)}</p>`;
  if (q.type === 'choix') {
    h += '<div class="choices">';
    cur.ordre.forEach((ci, k) => {
      let cls = 'choice';
      if (cur.repondu) cls += ci === q.bonne ? ' good' : ci === cur.choisi ? ' bad' : ' dim';
      h += `<button class="${cls}" data-act="choix" data-i="${ci}" ${cur.repondu ? 'disabled' : ''}><span class="key">${k + 1}</span><span class="jp">${rich(q.choix[ci])}</span></button>`;
    });
    h += '</div>';
  } else if (q.type === 'saisie') {
    const etat = cur.repondu ? (cur.res === 'ok' ? ' good' : cur.res === 'doute' ? ' doute' : ' bad') : '';
    h += `<div class="saisie${etat}"><input id="saisie" class="jp" lang="ja" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"
      placeholder="${q.script === 'kana' ? 'en hiragana…' : 'en japonais…'}" value="${esc(cur.donne || '')}" ${cur.repondu ? 'disabled' : ''}>
      ${cur.repondu ? '' : '<button class="btn primary" data-act="valider-saisie">Valider</button>'}</div>`;
  } else {
    const cls = cur.repondu ? (cur.res === 'ok' ? ' good' : ' bad') : '';
    h += `<div class="built${cls}">${cur.place.map(i => `<button class="tile" data-act="retirer" data-i="${i}" ${cur.repondu ? 'disabled' : ''}>${rich(q.morceaux[i])}</button>`).join('') || '<span class="muted">Touche les morceaux ci-dessous…</span>'}</div>`;
    h += `<div class="bank">${cur.ordre.filter(i => !cur.place.includes(i)).map(i => `<button class="tile" data-act="placer" data-i="${i}" ${cur.repondu ? 'disabled' : ''}>${rich(q.morceaux[i])}</button>`).join('')}</div>`;
    if (!cur.repondu) h += `<div class="actions"><button class="btn primary" data-act="valider-ordre" ${cur.place.length === q.morceaux.length ? '' : 'disabled'}>Valider</button></div>`;
  }
  h += '</div>';
  if (cur.repondu) h += vueRetour(q, cur);
  return h;
}

function vueRetour(q, cur) {
  const titre = cur.res === 'ok' ? '✓ Correct' : cur.res === 'doute' ? '? Réponse différente de celles prévues' : '✗ Raté';
  let h = `<div class="fb ${cur.res === 'ok' ? 'ok' : 'ko'}"><strong>${titre}</strong>`;
  if (cur.res !== 'ok') {
    const attendu = q.type === 'choix' ? q.choix[q.bonne] : q.type === 'saisie' ? q.reponses.join(' / ') : `${q.morceaux.join('')}`;
    h += `<p>Réponse attendue : <span class="jp">${rich(attendu)}</span></p>`;
  }
  if (cur.res === 'doute') h += '<p class="muted small">Ce n’est pas forcément faux : l’IA la vérifiera dans le bilan.</p>';
  if (q.explication) h += `<p>${rich(q.explication)}</p>`;
  if (cur.res === 'faux') h += '<p class="muted small">Elle reviendra plus loin, et l’IA t’expliquera ton erreur à la fin.</p>';
  h += '<button class="btn primary" data-act="suivant">Continuer</button></div>';
  return h;
}

// ---------- Bilan ----------

export function vueBilan(id) {
  const b = X.bilanParId(id);
  if (!b) return '<p class="muted">Bilan introuvable.</p><a class="btn" href="#/">Accueil</a>';
  const taux = b.score.total ? b.score.ok / b.score.total : 0;
  let h = `<a class="back" href="#/">← Accueil</a><section class="result ${taux < 0.6 ? 'fail' : 'pass'}"><p class="muted">Bilan du ${date(b.t)}</p>
    <div class="big-score">${b.score.ok}/${b.score.total}</div><p>${pct(taux)} du premier coup</p></section>`;
  if (b.strategie) h += `<p class="strategie">🎯 ${esc(b.strategie)}</p>`;
  if (b.consignes.length) h += `<section class="card"><h2>Pour la suite</h2><ul>${b.consignes.map(c => `<li>${rich(c)}</li>`).join('')}</ul></section>`;
  if (b.etoiles.length) {
    h += `<section class="card"><h2>⭐ Leçons à étoiler</h2><p class="muted small">Elles reviendront plus souvent ici et dans leur appli. Toucher ouvre la leçon et l’étoile.</p><div class="actions left">${b.etoiles.map(l => {
      const a = APPS.find(x => x.lettre === l.lettre);
      return a ? `<a class="btn" href="${esc(urlAppli(a, `#/lecon/${encodeURIComponent(l.id)}/etoiler`))}">⭐ ${esc(a.nom)} L${l.num}<small>${esc(l.titre)}</small></a>` : '';
    }).join('')}</div></section>`;
  }
  if (b.erreurs.length) {
    h += `<section class="card"><h2>Tes erreurs expliquées</h2>${b.erreurs.map(e => {
      const mot = String(e.cible || '').match(/^mot:(.+)$/)?.[1];
      return `<div class="bilan-erreur"><p class="jp">${rich(e.enonce)}</p>
      <p class="small"><span class="ok">✓ ${rich(e.attendu)}</span> · <span class="ko">✗ ${esc(e.donne || '—')}</span></p>
      ${e.pourquoi ? `<p>${rich(e.pourquoi)}</p>` : ''}${e.retenir ? `<p class="retenir">💡 ${rich(e.retenir)}</p>` : ''}
      ${mot && !L.has(mot) ? `<button class="link small" data-act="epingler" data-mot="${esc(mot)}">📌 Épingler ${esc(mot)}</button>` : ''}</div>`;
    }).join('')}</section>`;
  } else h += '<section class="card"><p>Aucune erreur : bravo ! 🎉</p></section>';
  h += '<div class="actions"><button class="btn primary" data-act="demarrer">Nouvelle séance</button><a class="btn" href="#/">Accueil</a></div>';
  return h;
}

// ---------- Réglages ----------

// Clé GitHub déjà enregistrée par une autre appli sur cet appareil (lecture seule).
export function cleGithubAilleurs() {
  for (const k of ['ng-sync', 'nv-sync', 'nk-sync']) {
    try { const c = JSON.parse(localStorage.getItem(k)); if (c?.token) return c.token; } catch { /* ignore */ }
  }
  return null;
}

export function vueReglages(modeles = null, message = '') {
  const r = IA.reglages();
  const cfg = Sync.getConfig();
  const st = S.get();
  const c = IA.compteurDuJour();
  let h = '<a class="back" href="#/">← Accueil</a><h1>Réglages</h1>';
  h += `<section class="card"><h2>IA : Google Gemini (gratuit)</h2>
    <p class="small">Ta clé reste sur cet appareil (à coller une fois sur le PC et une fois sur le téléphone). Elle n’est jamais dans le code ni dans le Gist.</p>
    ${r.cle ? `<p>Clé enregistrée : <code>${esc(r.cle.slice(0, 6))}…${esc(r.cle.slice(-4))}</code> · aujourd’hui : ${c.appels} appel${c.appels > 1 ? 's' : ''}, ${c.tokens} tokens</p>` : ''}
    <div class="row"><input type="password" id="cle-ia" placeholder="${r.cle ? 'Nouvelle clé (AIza…)' : 'Colle ta clé (AIza…)'}" autocomplete="off"><button class="btn primary" data-act="cle-ia">Enregistrer et tester</button></div>
    <p class="small" id="ia-msg">${esc(message)}</p>`;
  if (modeles?.length) {
    h += `<label class="row small">Modèle : <select data-act="modele">${modeles.map(m => `<option value="${esc(m.nom)}" ${m.nom === r.modele ? 'selected' : ''}>${esc(m.titre)}</option>`).join('')}</select></label>`;
  } else if (r.cle) h += `<p class="small">Modèle : ${esc((r.modele || 'choisi automatiquement').replace(/^models\//, ''))} · <button class="link small" data-act="lister-modeles">changer</button></p>`;
  if (r.cle) h += '<button class="link small" data-act="oublier-cle">Retirer la clé de cet appareil</button>';
  h += `<details class="small"><summary>Comment créer une clé gratuite ?</summary><ol>
    <li>Va sur <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com</a> et connecte-toi avec ton compte Google.</li>
    <li>Clique « Create API key » (« Créer une clé API »), puis copie la clé (elle commence par <code>AIza</code>).</li>
    <li>Colle-la ici. N’active pas la facturation : sans carte bancaire, la clé reste gratuite.</li></ol></details></section>`;
  h += '<section class="card"><h2>Synchronisation PC ↔ téléphone</h2>';
  if (cfg) {
    h += `<p>Connecté au compte GitHub <strong>${esc(cfg.login)}</strong>.</p><div class="actions left"><button class="btn" data-act="sync-now">Synchroniser maintenant</button><button class="btn" data-act="sync-off">Déconnecter cet appareil</button></div>`;
  } else {
    h += `<p class="small">Pour retrouver ton carnet, tes bilans et tes questions sur tes deux appareils.</p>
      ${cleGithubAilleurs() ? '<div class="actions left"><button class="btn primary" data-act="sync-ailleurs">Utiliser la clé GitHub de mes autres applis</button></div>' : ''}
      <div class="row"><input type="password" id="token" placeholder="ghp_…" autocomplete="off"><button class="btn" data-act="sync-on">Connecter</button></div>
      <p class="muted small" id="sync-err"></p>`;
  }
  h += '</section>';
  h += `<section class="card"><h2>Affichage</h2><label class="row"><input type="checkbox" data-act="furigana" ${st.settings.furigana ? 'checked' : ''}> Afficher les furigana</label></section>`;
  return h;
}

export function renderSyncBadge() {
  const el = document.getElementById('sync');
  const s = Sync.getStatus();
  el.textContent = s.state === 'off' ? '' : s.state === 'ok' ? '☁ ✓' : s.state === 'busy' ? '☁ …' : s.state === 'offline' ? '☁ hors ligne' : '☁ ⚠';
  el.className = `sync ${s.state}`;
}

