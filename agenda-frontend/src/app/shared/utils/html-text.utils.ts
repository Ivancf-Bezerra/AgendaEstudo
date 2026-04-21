/** Detecta marcação HTML simples (para decidir entre escapar ou renderizar). */
export function pareceHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texto corrido a partir de HTML (pré-visualizações, contadores, etc.). */
export function extrairTextoDeHtml(html: string): string {
  const d = globalThis.document.createElement('div');
  d.innerHTML = html;
  return (d.textContent ?? '').replace(/\s+/g, ' ').trim();
}
