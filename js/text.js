// Mise en forme du contenu : {漢字|かんじ} → furigana, **gras**, ==surligné==, ＿ → trou.

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function rich(s) {
  return esc(s)
    .replace(/\{([^|{}]+)\|([^{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>');
}

// Texte sans balisage (lecture en kanji seulement).
export function plain(s) {
  return String(s ?? '').replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1').replace(/\*\*|==/g, '');
}

// Phrase japonaise avec trou ; `fill` remplit le trou une fois la réponse donnée.
export function richBlank(s, fill = null) {
  const inner = fill == null ? '' : fill === '(rien)' ? '∅' : rich(fill);
  return String(s ?? '')
    .split('＿')
    .map(rich)
    .join(`<span class="blank${fill == null ? '' : ' filled'}">${inner}</span>`);
}
