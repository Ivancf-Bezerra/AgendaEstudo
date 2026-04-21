import { afterNextRender, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Pencil, StickyNote, Trash2, LucideAngularModule } from 'lucide-angular';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { LocalNotesService } from '../../core/services/local-notes.service';
import { QuickNoteUiService } from '../../core/services/quick-note-ui.service';
import type { NoteModel } from '../../shared/models/note.model';
import { extrairTextoDeHtml } from '../../shared/utils/html-text.utils';

interface MonthGroup {
  key: string;
  title: string;
  notes: NoteModel[];
}

@Component({
  selector: 'app-notes-list-page',
  standalone: true,
  imports: [LucideAngularModule, RouterLink],
  templateUrl: './notes-list.page.html',
  styleUrl: './notes-list.page.scss',
})
export class NotesListPage {
  readonly iconNote = StickyNote;
  readonly iconPencil = Pencil;
  readonly iconTrash = Trash2;

  private readonly store = inject(LocalNotesService);
  private readonly quickUi = inject(QuickNoteUiService);
  private readonly confirmacao = inject(ConfirmDialogService);

  readonly focusId = signal<string | null>(null);

  readonly monthGroups = computed((): MonthGroup[] => {
    const list = [...this.store.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
    const map = new Map<string, NoteModel[]>();
    for (const n of list) {
      const d = new Date(n.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(n);
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
    return keys.map((key) => {
      const first = map.get(key)![0]!;
      const title = monthFmt.format(new Date(first.createdAt));
      return { key, title, notes: map.get(key)! };
    });
  });

  constructor() {
    const hash = globalThis.location?.hash?.replace(/^#/, '') ?? '';
    const m = hash.match(/^note-(.+)$/);
    if (m?.[1]) {
      this.focusId.set(m[1]);
    }
    const url = new URL(globalThis.location?.href ?? '', 'http://local');
    const q = url.searchParams.get('note');
    if (q) {
      this.focusId.set(q);
    }
    afterNextRender(() => {
      const id = this.focusId();
      if (!id) {
        return;
      }
      globalThis.document.getElementById(`note-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  preview(html: string): string {
    const t = extrairTextoDeHtml(html);
    return t.length > 180 ? `${t.slice(0, 179)}…` : t || 'Nota vazia';
  }

  /** Primeira frase (ou excerto curto) para a barra de título do cartão. */
  tituloCartao(html: string): string {
    const t = extrairTextoDeHtml(html).trim();
    if (!t) {
      return 'Sem título';
    }
    const m = t.match(/^.{1,88}?[.!?](?=\s|$)/);
    let head = (m ? m[0] : t.slice(0, 72)).trim();
    if (head.length > 60) {
      head = `${head.slice(0, 59)}…`;
    }
    return head || 'Sem título';
  }

  formatCreated(n: NoteModel): string {
    const d = new Date(n.createdAt);
    return `${d.toLocaleDateString('pt-BR')} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  openEdit(id: string): void {
    this.quickUi.openEdit(id);
  }

  onHeadClick(ev: MouseEvent, id: string): void {
    if ((ev.target as HTMLElement).closest('.note-card__actions')) {
      return;
    }
    this.openEdit(id);
  }

  async excluirNota(ev: MouseEvent, id: string): Promise<void> {
    ev.stopPropagation();
    ev.preventDefault();
    const ok = await this.confirmacao.pedirConfirmacao({
      titulo: 'Eliminar esta nota?',
      mensagem: 'A nota será apagada de forma permanente.',
      textoConfirmar: 'Eliminar',
      textoCancelar: 'Cancelar',
      variante: 'perigo',
    });
    if (!ok) {
      return;
    }
    if (this.quickUi.editingNoteId() === id) {
      this.quickUi.close();
    }
    this.store.delete(id);
  }

  cardHostId(id: string): string {
    return `note-${id}`;
  }
}
