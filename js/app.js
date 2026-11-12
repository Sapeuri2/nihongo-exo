// Challenger — point d'entrée : routage, événements, démarrage.
// Utilise du noyau : text.js, state.js (sa progression), sync.js (Gist), liste.js (Ma liste), ui.js (message bref).

import * as S from './state.js';
import * as Sync from './sync.js';
import * as L from './liste.js';
import { toast } from './ui.js';
import * as IA from './exo-ia.js';
import * as X from './exo-seance.js';
import { cleGithubAilleurs, renderSyncBadge, vueAccueil, vueBilan, vueChoisir, vueReglages, vueSeance } from './exo-vues.js';

const app = document.getElementById('app');
let furiBtn = null;
let route = null;
let reglagesEtat = { modeles: null, message: '' };
// « Je choisis mes leçons » : cochées pour la prochaine séance seulement (pas enregistrées).
const coches = new Set();
let etatsChoix = null;

function render() {
  document.body.classList.toggle('nofuri', !S.get().settings.furigana);
  const hash = location.hash || '#/';
  let html;
  if (hash === '#/seance') html = vueSeance() ?? (go('#/'), '');
  else if (hash.startsWith('#/bilan/')) html = vueBilan(decodeURIComponent(hash.slice(8)));
  else if (hash === '#/reglages') html = vueReglages(reglagesEtat.modeles, reglagesEtat.message);
  else if (hash === '#/choisir') {
    html = vueChoisir(etatsChoix, coches);
    if (!etatsChoix) X.contexte().then(c => { etatsChoix = c.etats; if (location.hash === '#/choisir') render(); }).catch(e => alert(e.message || String(e)));
  }
  else html = vueAccueil();
  // Ne pas perdre ce qui est en train d'être tapé (cases de saisie) quand on redessine.
  const tapes = [...app.querySelectorAll('input.saisie-in')].filter(i => !i.disabled).map(i => [i.id, i.value]);
  const actif = document.activeElement?.classList?.contains('saisie-in') ? document.activeElement.id : null;
  if (html) app.innerHTML = html;
  for (const [id, v] of tapes) { const i = document.getElementById(id); if (i && !i.disabled && !i.value) i.value = v; }
  if (actif) document.getElementById(actif)?.focus();
  if (hash !== route) { route = hash; window.scrollTo(0, 0); }
  furiBtn?.classList.toggle('off', !S.get().settings.furigana);
  // Première case vide prête à taper.
  if (!document.activeElement?.classList?.contains('saisie-in')) {
    const vide = [...app.querySelectorAll('input.saisie-in')].find(i => !i.disabled && !i.value);
    vide?.focus({ preventScroll: true });
  }
}

function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

async function demarrer(sansIA, choisies = []) {
  try {
    toast('Préparation de la séance…');
    await X.demarrer({ sansIA, choisies });
    coches.clear(); // le choix ne vaut que pour cette séance
    go('#/seance');
  } catch (e) {
    alert(e.message || String(e));
  }
}

// Question suivante ; à la fin de la séance, le bilan s'ouvre dès qu'il est prêt.
function avancer() {
  const p = X.suivant();
  window.scrollTo(0, 0);
  p?.then(b => b && go(`#/bilan/${b.id}`));
}

function valider() {
  const q = X.question();
  if (!q || X.get().cur?.repondu) return;
  if (q.type === 'saisie') {
    const v = document.getElementById('saisie')?.value || '';
    if (!v.trim()) return;
    X.repondre(v);
  } else if (q.type === 'trous') {
    const champs = [...app.querySelectorAll('input[data-trou]')];
    const vide = champs.find(i => !i.value.trim());
    if (vide) { vide.focus(); return; } // toutes les cases d'abord
    X.repondre(champs.map(i => i.value));
  } else if (q.type === 'ordre') {
    if (X.get().cur.place.length === q.morceaux.length) X.repondre();
  }
}

async function testerCle(cle) {
  reglagesEtat = { modeles: null, message: 'Vérification de la clé…' };
  render();
  try {
    const modeles = await IA.listerModeles(cle);
    if (!modeles.length) throw new IA.ErreurIA('modele', 'Clé valide, mais aucun modèle Gemini utilisable.');
    const r = IA.reglages();
    const modele = modeles.some(m => m.nom === r.modele) ? r.modele : modeles[0].nom;
    IA.enregistrer({ cle, modele });
    reglagesEtat = { modeles, message: `✓ Clé valide. Modèle choisi : ${modele.replace(/^models\//, '')}.` };
  } catch (e) {
    reglagesEtat = { modeles: null, message: `✗ ${e.message}` };
  }
  render();
}

async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) {
    // Furigana masqués : toucher un kanji montre sa lecture.
    const ruby = e.target.closest('ruby');
    if (ruby && document.body.classList.contains('nofuri') && !ruby.closest('button')) ruby.classList.toggle('reveal');
    return;
  }
  const act = el.dataset.act;
  switch (act) {
    case 'demarrer': demarrer(false); break;
    case 'demarrer-sans-ia': demarrer(true); break;
    case 'demarrer-choix': demarrer(false, [...coches]); break;
    case 'demarrer-choix-sans-ia': demarrer(true, [...coches]); break;
    case 'decocher': coches.clear(); render(); break;
    case 'reprendre': go('#/seance'); break;
    case 'abandonner':
      if (confirm('Abandonner la séance ? Les réponses déjà données sont gardées, mais il n’y aura pas de bilan.')) { X.abandonner(); go('#/'); }
      break;
    case 'choix': X.repondre(+el.dataset.i); break;
    case 'placer': X.placer(+el.dataset.i); break;
    case 'retirer': X.retirer(+el.dataset.i); break;
    case 'valider-saisie': case 'valider-ordre': valider(); break;
    case 'suivant': avancer(); break;
    case 'regenerer': X.generer(); break;
    case 'sans-ia': X.continuerSansIA(); break;
    case 'bilan': go('#/seance'); X.faireBilan().then(b => b && go(`#/bilan/${b.id}`)); break;
    case 'bilan-sans-ia': go('#/seance'); X.faireBilan({ sansIA: true }).then(b => b && go(`#/bilan/${b.id}`)); break;
    case 'epingler':
      if (L.add({ jp: el.dataset.mot, app: 'exo', src: 'challenger' })) { toast('📌 Épinglé dans ma liste'); el.remove(); }
      break;
    case 'cle-ia': {
      const cle = document.getElementById('cle-ia').value.trim();
      if (cle) testerCle(cle);
      break;
    }
    case 'lister-modeles': testerCle(IA.reglages().cle); break;
    case 'oublier-cle':
      if (confirm('Retirer la clé Gemini de cet appareil ?')) { IA.enregistrer({ cle: '', modele: '' }); reglagesEtat = { modeles: null, message: '' }; render(); }
      break;
    case 'sync-ailleurs': connecter(cleGithubAilleurs()); break;
    case 'sync-on': connecter(document.getElementById('token').value); break;
    case 'sync-now': Sync.syncNow(); break;
    case 'sync-off': if (confirm('Déconnecter la synchro sur cet appareil ?')) { Sync.disconnect(); render(); } break;
  }
}

async function connecter(token) {
  if (!token?.trim()) return;
  const err = document.getElementById('sync-err');
  if (err) err.textContent = 'Connexion…';
  try { await Sync.connect(token); render(); } catch (e) { if (err) err.textContent = e.message; }
}

function onChangeInput(e) {
  const act = e.target.dataset.act;
  if (act === 'cocher') {
    if (e.target.checked) coches.add(e.target.dataset.id); else coches.delete(e.target.dataset.id);
    // Pas de redessin (les listes ouvertes restent ouvertes) : seuls les boutons changent.
    const n = coches.size;
    const go = app.querySelector('[data-act="demarrer-choix"]');
    if (go) go.textContent = `Lancer avec ${n} leçon${n > 1 ? 's' : ''}`;
    app.querySelectorAll('[data-act^="demarrer-choix"]').forEach(b => { b.disabled = !n; });
  }
  if (act === 'furigana') { S.setSetting('furigana', e.target.checked); render(); }
  if (act === 'modele') { IA.enregistrer({ modele: e.target.value }); reglagesEtat.message = `Modèle : ${e.target.value.replace(/^models\//, '')}`; render(); }
}

function onKey(e) {
  if (location.hash !== '#/seance') return;
  const s = X.get();
  const cur = s?.cur;
  if (!cur) return;
  if (e.key === 'Enter') {
    // Clavier japonais : Entrée valide d'abord la conversion (composition), pas la réponse.
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (cur.repondu) avancer(); else valider(); // (questions à trous : valider va d'abord à la case vide suivante)
  } else if (!cur.repondu && e.target.tagName !== 'INPUT' && /^[1-9]$/.test(e.key)) {
    app.querySelectorAll('[data-act="choix"]')[+e.key - 1]?.click();
  }
}

function main() {
  // Bouton 漢 : afficher / masquer les furigana.
  furiBtn = Object.assign(document.createElement('button'), { className: 'furi-toggle jp', title: 'Afficher / masquer les furigana' });
  furiBtn.innerHTML = '<ruby>漢<rt>かん</rt></ruby>';
  furiBtn.addEventListener('click', () => { S.setSetting('furigana', !S.get().settings.furigana); render(); });
  document.querySelector('.top .gear')?.before(furiBtn);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  app.addEventListener('click', onClick);
  app.addEventListener('change', onChangeInput);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', render);
  // Pendant une conversion au clavier japonais (composition), on attend la fin avant de redessiner.
  let compose = false;
  let enAttente = false;
  document.addEventListener('compositionstart', () => { compose = true; });
  document.addEventListener('compositionend', () => { compose = false; if (enAttente) { enAttente = false; render(); } });
  X.onChange(() => { if (compose) enAttente = true; else render(); });
  S.onChange(meta => { if (!meta.fromSync) Sync.schedule(); else if (location.hash !== '#/seance') render(); });
  L.onChange(meta => { if (!meta.fromSync && !meta.fromStorage) Sync.schedule(); });
  Sync.onStatus(() => { renderSyncBadge(); if (location.hash === '#/reglages') render(); });
  // Séance reprise après un rechargement : questions de l'IA encore attendues, ou bilan interrompu.
  const s = X.get();
  if (s?.gen === 'attente' && !s.fin) X.generer();
  if (s?.fin && s.bilanEnCours) { s.bilanEnCours = false; }
  renderSyncBadge();
  render();
  Sync.init();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

main();
