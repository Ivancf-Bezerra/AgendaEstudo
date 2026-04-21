/**
 * `document.queryCommandState` só é confiável quando a edição está neste editor.
 * Caso contrário, o navegador pode devolver estado antigo ou de outro contexto.
 */
export function focoEstaNoEditor(editor: HTMLElement | null | undefined): boolean {
  if (!editor) {
    return false;
  }
  const ativo = document.activeElement;
  if (ativo === editor) {
    return true;
  }
  return ativo instanceof Node && editor.contains(ativo);
}
