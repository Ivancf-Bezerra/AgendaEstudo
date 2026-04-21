export interface NoteModel {
  id: string;
  /** ISO — fixa na criação. */
  createdAt: string;
  updatedAt: string;
  /** `yyyy-mm-dd` do dia no calendário (= dia de criação). */
  dayKey: string;
  /** HTML simples (negrito, itálico, listas). */
  bodyHtml: string;
}

export interface CreateNoteInput {
  bodyHtml: string;
  /** Só para dados de exemplo / migração. */
  createdAt?: string;
}
