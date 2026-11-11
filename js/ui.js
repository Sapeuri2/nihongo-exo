// Petits éléments d'interface communs : pourcentage, barre de maîtrise, message bref.
export const pct = x => `${Math.round(x * 100)} %`;

export function bar(m) {
  if (m == null) return '';
  const cls = m < 0.4 ? 'weak' : m < 0.75 ? 'mid' : 'good';
  return `<span class="mbar ${cls}" title="Maîtrise ${pct(m)}"><span style="width:${Math.round(m * 100)}%"></span></span>`;
}

let toastTimer = null;

export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = Object.assign(document.createElement('div'), { id: 'toast', className: 'toast' }); document.body.append(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
