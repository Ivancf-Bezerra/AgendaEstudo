import { Injectable, signal } from '@angular/core';

/** Abre o bloco de notas rápidas a partir do layout ou da lista de notas. */
@Injectable({ providedIn: 'root' })
export class QuickNoteUiService {
  readonly open = signal(false);
  /** `null` = rascunho novo; caso contrário edição deste id. */
  readonly editingNoteId = signal<string | null>(null);

  openNew(): void {
    this.editingNoteId.set(null);
    this.open.set(true);
  }

  openEdit(noteId: string): void {
    this.editingNoteId.set(noteId);
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    this.editingNoteId.set(null);
  }
}
