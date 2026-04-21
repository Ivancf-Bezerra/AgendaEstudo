import {
  Component,
  ElementRef,
  HostListener,
  Injector,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Bold, Italic, List, LucideAngularModule, StickyNote, X } from 'lucide-angular';
import { LocalNotesService } from '../../../core/services/local-notes.service';
import { QuickNoteUiService } from '../../../core/services/quick-note-ui.service';
import { extrairTextoDeHtml } from '../../utils/html-text.utils';
import { focoEstaNoEditor } from '../../utils/rich-text-editor-context.util';

interface EstadoFormatacaoNota {
  bold: boolean;
  italic: boolean;
  list: boolean;
}

@Component({
  selector: 'app-quick-note-pad',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './quick-note-pad.component.html',
  styleUrl: './quick-note-pad.component.scss',
})
export class QuickNotePadComponent implements OnDestroy {
  readonly iconClose = X;
  readonly iconNote = StickyNote;
  readonly iconBold = Bold;
  readonly iconItalic = Italic;
  readonly iconList = List;

  private readonly notes = inject(LocalNotesService);
  readonly quickNoteUi = inject(QuickNoteUiService);
  private readonly inj = inject(Injector);

  private readonly editorRef = viewChild<ElementRef<HTMLDivElement>>('editor');

  readonly savedHint = signal('');
  readonly estadoFormatacao = signal<EstadoFormatacaoNota>({ bold: false, italic: false, list: false });

  private localNoteId: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly doc = globalThis.document;

  constructor() {
    effect(() => {
      const open = this.quickNoteUi.open();
      const editId = this.quickNoteUi.editingNoteId();
      if (!open) {
        this.limparTemporizadorSalvamento();
        this.localNoteId = null;
        return;
      }
      afterNextRender(
        () => {
          const ed = this.editorRef()?.nativeElement;
          if (!ed) {
            return;
          }
          if (editId) {
            const n = this.notes.getById(editId);
            this.localNoteId = editId;
            ed.innerHTML = n?.bodyHtml ?? '';
          } else {
            this.localNoteId = null;
            ed.innerHTML = '';
          }
          this.atualizarEstadoFormatacao();
          ed.focus();
        },
        { injector: this.inj },
      );
    });
  }

  ngOnDestroy(): void {
    this.limparTemporizadorSalvamento();
  }

  close(): void {
    const ed = this.editorRef()?.nativeElement;
    const html = ed?.innerHTML ?? '';
    if (extrairTextoDeHtml(html).length === 0 && this.localNoteId) {
      this.notes.delete(this.localNoteId);
    }
    this.quickNoteUi.close();
    this.savedHint.set('');
  }

  exec(cmd: 'bold' | 'italic' | 'insertUnorderedList'): void {
    this.doc.execCommand(cmd, false);
    this.editorRef()?.nativeElement?.focus();
    this.atualizarEstadoFormatacao();
    this.agendarSalvamento();
  }

  onInput(): void {
    this.atualizarEstadoFormatacao();
    this.agendarSalvamento();
  }

  aoPressionarTeclaEditor(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' || ev.shiftKey) {
      return;
    }
    if (!this.doc.queryCommandState('insertUnorderedList')) {
      return;
    }
    ev.preventDefault();
    this.doc.execCommand('insertParagraph', false);
    requestAnimationFrame(() => {
      this.atualizarEstadoFormatacao();
      this.agendarSalvamento();
    });
  }

  aoMudarSelecaoEditor(): void {
    this.atualizarEstadoFormatacao();
  }

  private agendarSalvamento(): void {
    this.limparTemporizadorSalvamento();
    this.saveTimer = setTimeout(() => this.executarSalvamento(), 650);
  }

  private limparTemporizadorSalvamento(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private executarSalvamento(): void {
    this.saveTimer = null;
    const ed = this.editorRef()?.nativeElement;
    if (!ed) {
      return;
    }
    const html = ed.innerHTML;
    const plain = extrairTextoDeHtml(html);
    if (plain.length === 0) {
      if (this.localNoteId) {
        this.notes.delete(this.localNoteId);
        this.localNoteId = null;
        this.savedHint.set('');
      }
      return;
    }
    if (!this.localNoteId) {
      const n = this.notes.create({ bodyHtml: html });
      this.localNoteId = n.id;
      const t = new Date(n.createdAt);
      this.savedHint.set(
        `Guardado · criada em ${t.toLocaleDateString('pt-BR')} ${t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      );
    } else {
      this.notes.update(this.localNoteId, html);
      const t = new Date();
      this.savedHint.set(`Atualizado às ${t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    }
  }

  onEditorMouseDown(ev: MouseEvent): void {
    ev.stopPropagation();
  }

  aoPerderFocoEditor(): void {
    this.estadoFormatacao.set({ bold: false, italic: false, list: false });
  }

  private atualizarEstadoFormatacao(): void {
    const ed = this.editorRef()?.nativeElement;
    if (!ed) {
      this.estadoFormatacao.set({ bold: false, italic: false, list: false });
      return;
    }
    if (!focoEstaNoEditor(ed)) {
      this.estadoFormatacao.set({ bold: false, italic: false, list: false });
      return;
    }
    this.estadoFormatacao.set({
      bold: !!this.doc.queryCommandState('bold'),
      italic: !!this.doc.queryCommandState('italic'),
      list: !!this.doc.queryCommandState('insertUnorderedList'),
    });
  }

  @HostListener('document:keydown.escape')
  onEscapeClose(): void {
    if (this.quickNoteUi.open()) {
      this.close();
    }
  }
}
