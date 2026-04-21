import { afterNextRender, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Calendar1,
  ChevronLeft,
  CircleCheck,
  ChevronRight,
  Circle,
  Clock,
  Bold,
  FileText,
  Heading,
  Italic,
  List,
  ListPlus,
  LucideAngularModule,
  Palette,
  Pencil,
  Plus,
  Save,
  Tag,
  Trash2,
  Type,
} from 'lucide-angular';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { LocalEventsService } from '../../core/services/local-events.service';
import { ToastService } from '../../core/services/toast.service';
import { EVENT_COLOR_PRESETS, eventAccentColor } from '../../shared/constants/event-colors';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { CelebrationService } from '../../shared/services/celebration.service';
import type { EventModel } from '../../shared/models/event.model';
import {
  addDays,
  addMonths,
  buildMonthGridCells,
  clockNowHHMM,
  eventStartDate,
  formatEventTimeRange,
  isBeforeToday,
  isEndTimeAfterStartSameDay,
  normalizeToHHMM,
  parseHHMM,
  startOfDay,
  startOfMonth,
  startOfWeekMonday,
  timeIntervalsOverlap,
  toDateKey,
} from '../../shared/utils/date.utils';
import { escaparHtml, extrairTextoDeHtml, pareceHtml } from '../../shared/utils/html-text.utils';
import { focoEstaNoEditor } from '../../shared/utils/rich-text-editor-context.util';

function clockHHMMValidator(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = String(c.value ?? '').trim();
    if (!v) {
      return null;
    }
    return normalizeToHHMM(v) ? null : { clock: true };
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function markdownLikeToHtml(raw: string): string {
  const lines = raw.split(/\r?\n/);
  let inList = false;
  const out: string[] = [];
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (trimmed.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      const item = trimmed.slice(2);
      out.push(`<li>${inlineMarkdownToHtml(item)}</li>`);
      continue;
    }
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    if (!trimmed) {
      out.push('<br>');
    } else {
      out.push(`<p>${inlineMarkdownToHtml(ln)}</p>`);
    }
  }
  if (inList) {
    out.push('</ul>');
  }
  return out.join('');
}

function inlineMarkdownToHtml(raw: string): string {
  const safe = escaparHtml(raw);
  return safe
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

interface PostSaveIntegrationRow {
  key: string;
  date: Date;
  label: string;
  disabled: boolean;
  disabledReason?: string;
}

interface PostSaveIntegrationTemplate {
  basePayload: {
    title: string;
    subtitle: string | undefined;
    description: string | undefined;
    tags: string[] | undefined;
    colorKey: string;
  };
  startStr: string;
  endStr: string;
}

type PostSaveIntegrationMode = 'all' | 'weekdays' | 'weekend' | 'custom';

type TimeSide = 'start' | 'end';
type TimePart = 'h' | 'm';

interface TimePair {
  h: string;
  m: string;
}

interface DescriptionFormatState {
  bold: boolean;
  italic: boolean;
  list: boolean;
}

/** Soma 1 h ao `HH:mm`, até 23:59. */
function addOneHourHHMM(hhmm: string): string {
  const p = parseHHMM(hhmm);
  if (!p) {
    return '10:00';
  }
  const mins = Math.min(23 * 60 + 59, p.h * 60 + p.m + 60);
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

@Component({
  selector: 'app-event-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, TooltipDirective],
  templateUrl: './event-form.page.html',
  styleUrl: './event-form.page.scss',
})
export class EventFormPage {
  readonly iconChevronLeft = ChevronLeft;
  readonly iconChevronRight = ChevronRight;
  readonly iconClock = Clock;
  readonly iconType = Type;
  readonly iconHeading = Heading;
  readonly iconFileText = FileText;
  readonly iconTag = Tag;
  readonly iconPalette = Palette;
  readonly iconSave = Save;
  readonly iconListPlus = ListPlus;
  readonly iconDayEvents = Calendar1;
  readonly iconCheck = CircleCheck;
  readonly iconCircle = Circle;
  readonly iconTrash = Trash2;
  readonly iconPlus = Plus;
  readonly iconPencil = Pencil;
  readonly iconBold = Bold;
  readonly iconItalic = Italic;
  readonly iconList = List;
  readonly descriptionFormatState = signal<DescriptionFormatState>({
    bold: false,
    italic: false,
    list: false,
  });

  @ViewChild('descriptionArea') private descriptionArea?: ElementRef<HTMLDivElement>;

  readonly colorPresets = EVENT_COLOR_PRESETS;
  /** Máximo de tags por evento. */
  readonly maxTags = 5;

  readonly eventTags = signal<string[]>([]);

  /** Dígitos visíveis (hora / minuto) — o formulário guarda `startTime` / `endTime` em `HH:mm`. */
  readonly timeUi = signal<{ start: TimePair; end: TimePair }>({
    start: { h: '09', m: '00' },
    end: { h: '10', m: '00' },
  });

  private readonly fb = inject(FormBuilder);
  private readonly events = inject(LocalEventsService);
  private readonly celebration = inject(CelebrationService);
  private readonly confirmacao = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Quando definido, o formulário está a editar este evento. */
  readonly editingId = signal<string | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  readonly monthAnchor = signal<Date>(new Date());
  /** Dias em que o evento ocorre (ordenados, únicos). Em edição: um só. */
  readonly selectedDays = signal<Date[]>([]);
  /** Primeiro dia — horários e várias verificações usam este âncora. */
  readonly selectedDay = computed(() => this.selectedDays()[0] ?? null);

  /** Permite clicar no calendário para marcar/desmarcar vários dias (só criação). */
  readonly multiCalendarPick = signal(false);

  /** Após salvar um único dia (sem multi-seleção), oferece integrar a outros dias da semana. */
  readonly postSaveIntegrationOpen = signal(false);
  readonly postSaveIntegrationRows = signal<PostSaveIntegrationRow[]>([]);
  /** Seleção no modal pós-salvamento (chaves `yyyy-mm-dd`). */
  readonly postSaveIntegrationSelected = signal(new Set<string>());
  readonly postSaveIntegrationMode = signal<PostSaveIntegrationMode>('all');
  readonly postSaveIntegrationWeekdays = signal(new Set<number>([1, 2, 3, 4, 5]));
  private postSaveIntegrationTemplate: PostSaveIntegrationTemplate | null = null;

  readonly monthGrid = computed(() => buildMonthGridCells(this.monthAnchor()));
  readonly monthTitle = computed(() =>
    new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(this.monthAnchor()),
  );

  readonly eventsForSelectedDay = computed(() => {
    const day = this.selectedDay();
    if (!day) {
      return [];
    }
    const key = toDateKey(day);
    const list = this.events.all().filter((e) => toDateKey(eventStartDate(e)) === key);
    return [...list].sort((a, b) => {
      const ac = a.completed ? 1 : 0;
      const bc = b.completed ? 1 : 0;
      if (ac !== bc) {
        return ac - bc;
      }
      return a.startDate.localeCompare(b.startDate);
    });
  });

  readonly weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  readonly form = this.fb.nonNullable.group(
    {
      title: ['', [Validators.required, Validators.maxLength(120)]],
      subtitle: ['', [Validators.maxLength(160)]],
      description: ['', [Validators.maxLength(2000)]],
      tagDraft: ['', [Validators.maxLength(48)]],
      colorKey: ['default'],
      startTime: [{ value: '09:00', disabled: true }, [Validators.required, clockHHMMValidator()]],
      endTime: [{ value: '10:00', disabled: true }, [Validators.required, clockHHMMValidator()]],
    },
    { updateOn: 'change' },
  );

  constructor() {
    const editId = this.route.snapshot.paramMap.get('id');
    const isEditRoute = this.router.url.includes('/edit') && !!editId;

    if (isEditRoute && editId) {
      const ev = this.events.all().find((e) => e.id === editId);
      if (!ev) {
        void this.router.navigateByUrl('/');
      } else {
        this.editingId.set(editId);
        this.applyEventToForm(ev);
      }
    } else {
      const today = startOfDay(new Date());
      this.monthAnchor.set(today);
      this.selectedDays.set([today]);
      this.multiCalendarPick.set(false);
      const start = clockNowHHMM();
      this.form.controls.startTime.enable();
      this.form.controls.endTime.enable();
      this.form.patchValue({ startTime: start, endTime: addOneHourHHMM(start) });
    }
    this.syncUiFromForm();

    afterNextRender(() => {
      queueMicrotask(() => {
        this.ensureTimesWhenDaySelected();
        this.syncDescriptionEditorFromForm();
      });
    });
  }

  readonly selectedDayLabel = computed(() => {
    const days = [...this.selectedDays()].sort((a, b) => a.getTime() - b.getTime());
    if (!days.length) {
      return '';
    }
    if (days.length === 1) {
      return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(days[0]!);
    }
    const df = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
    const first = days[0]!;
    const last = days[days.length - 1]!;
    return `${days.length} dias · ${df.format(first)} → ${df.format(last)}`;
  });

  canSave(): boolean {
    const days = this.selectedDays();
    if (!days.length) {
      return false;
    }
    if (!this.form.controls.title.value.trim()) {
      return false;
    }
    if (this.form.controls.startTime.disabled) {
      return false;
    }
    const raw = this.form.getRawValue();
    const startStr = normalizeToHHMM(String(raw.startTime).trim());
    const endStr = normalizeToHHMM(String(raw.endTime).trim());
    if (!startStr || !endStr) {
      return false;
    }
    const a = parseHHMM(startStr);
    const b = parseHHMM(endStr);
    if (!a || !b) {
      return false;
    }
    const exclude = this.editingId();
    for (const day of days) {
      if (!exclude && isBeforeToday(day)) {
        return false;
      }
      const start = new Date(startOfDay(day));
      start.setHours(a.h, a.m, 0, 0);
      const end = new Date(startOfDay(day));
      end.setHours(b.h, b.m, 0, 0);
      if (!isEndTimeAfterStartSameDay(start, end)) {
        return false;
      }
      if (this.hasOverlap(day, start, end, exclude)) {
        return false;
      }
    }
    return true;
  }

  /** Mostrar aviso de choque com outro evento no mesmo dia (qualquer dia selecionado). */
  overlapWithOtherEvent(): boolean {
    const days = this.selectedDays();
    if (!days.length || this.form.controls.startTime.disabled) {
      return false;
    }
    const raw = this.form.getRawValue();
    const startStr = normalizeToHHMM(String(raw.startTime).trim());
    const endStr = normalizeToHHMM(String(raw.endTime).trim());
    if (!startStr || !endStr) {
      return false;
    }
    const a = parseHHMM(startStr);
    const b = parseHHMM(endStr);
    if (!a || !b) {
      return false;
    }
    const exclude = this.editingId();
    for (const day of days) {
      if (!exclude && isBeforeToday(day)) {
        continue;
      }
      const start = new Date(startOfDay(day));
      start.setHours(a.h, a.m, 0, 0);
      const end = new Date(startOfDay(day));
      end.setHours(b.h, b.m, 0, 0);
      if (!isEndTimeAfterStartSameDay(start, end)) {
        continue;
      }
      if (this.hasOverlap(day, start, end, exclude)) {
        return true;
      }
    }
    return false;
  }

  formatEventRange(ev: EventModel): string {
    return formatEventTimeRange(ev);
  }

  eventDescriptionHtml(value?: string): string {
    const t = (value ?? '').trim();
    if (!t) {
      return '';
    }
    if (pareceHtml(t)) {
      return t;
    }
    return escaparHtml(t).replace(/\r?\n/g, '<br>');
  }

  eventCardSummary(value?: string): string {
    const raw = (value ?? '').trim();
    if (!raw) {
      return '';
    }
    const plain = pareceHtml(raw) ? extrairTextoDeHtml(raw) : raw.replace(/\s+/g, ' ').trim();
    if (plain.length <= 140) {
      return plain;
    }
    return `${plain.slice(0, 137).trimEnd()}...`;
  }

  eventAccent(ev: EventModel): string {
    return eventAccentColor(ev.colorKey);
  }

  /** Cor do preset escolhido no formulário — faixa do relógio e cursor dos dígitos. */
  timePanelAccent(): string {
    const k = this.form.getRawValue().colorKey;
    return eventAccentColor(typeof k === 'string' ? k : undefined);
  }

  goPrevMonth(): void {
    if (!this.canGoPrevMonth()) {
      return;
    }
    this.monthAnchor.update((d) => addMonths(d, -1));
  }

  goNextMonth(): void {
    this.monthAnchor.update((d) => addMonths(d, 1));
  }

  toggleMultiCalendarPick(checked: boolean): void {
    if (this.isEditing()) {
      return;
    }
    this.multiCalendarPick.set(checked);
    if (!checked && this.selectedDays().length > 1) {
      const first = this.selectedDays()[0]!;
      this.selectedDays.set([first]);
      this.afterDaysChanged(false);
    }
  }

  onMultiPickCheckboxChange(ev: Event): void {
    const el = ev.target as HTMLInputElement | null;
    if (el && el.type === 'checkbox') {
      this.toggleMultiCalendarPick(el.checked);
    }
  }

  pickDay(date: Date): void {
    if (this.isPastCell(date)) {
      return;
    }
    const day = startOfDay(date);
    if (this.isEditing()) {
      this.applySingleDayPick(day);
      return;
    }
    // Seleção multi-dias automática na criação:
    // clicar num novo dia adiciona; clicar num dia já marcado remove (mantendo pelo menos um).
    this.toggleMultiDay(day);
  }

  private applySingleDayPick(day: Date): void {
    const wasDisabled = this.form.controls.startTime.disabled;
    this.selectedDays.set([day]);
    this.form.controls.startTime.enable();
    this.form.controls.endTime.enable();
    if (wasDisabled) {
      const start = toDateKey(day) === toDateKey(startOfDay(new Date())) ? clockNowHHMM() : '09:00';
      queueMicrotask(() => {
        this.form.patchValue({ startTime: start, endTime: addOneHourHHMM(start) });
        this.ensureTimesWhenDaySelected();
        this.syncUiFromForm();
      });
    } else {
      this.syncUiFromForm();
    }
  }

  private afterDaysChanged(wasDisabled: boolean): void {
    this.form.controls.startTime.enable();
    this.form.controls.endTime.enable();
    if (wasDisabled) {
      const day = this.selectedDay();
      const start =
        day && toDateKey(day) === toDateKey(startOfDay(new Date())) ? clockNowHHMM() : '09:00';
      queueMicrotask(() => {
        this.form.patchValue({ startTime: start, endTime: addOneHourHHMM(start) });
        this.ensureTimesWhenDaySelected();
        this.syncUiFromForm();
      });
    } else {
      this.syncUiFromForm();
    }
  }

  private toggleMultiDay(day: Date): void {
    const key = toDateKey(day);
    const cur = this.selectedDays().map(startOfDay);
    const ix = cur.findIndex((d) => toDateKey(d) === key);
    let next: Date[];
    if (ix >= 0) {
      if (cur.length === 1) {
        return;
      }
      next = cur.filter((_, i) => i !== ix);
    } else {
      next = [...cur, day];
    }
    const wasDisabled = this.form.controls.startTime.disabled;
    this.selectedDays.set(this.sortUniqueDays(next));
    this.afterDaysChanged(wasDisabled);
  }

  private sortUniqueDays(dates: Date[]): Date[] {
    const m = new Map<string, Date>();
    for (const d of dates) {
      const x = startOfDay(d);
      m.set(toDateKey(x), x);
    }
    return [...m.values()].sort((a, b) => a.getTime() - b.getTime());
  }

  canGoPrevMonth(): boolean {
    const anchor = this.monthAnchor();
    const first = startOfMonth(anchor);
    const thisMonthStart = startOfMonth(new Date());
    return first.getTime() > thisMonthStart.getTime();
  }

  isPastCell(date: Date): boolean {
    const id = this.editingId();
    if (id) {
      const ev = this.events.all().find((e) => e.id === id);
      if (ev && toDateKey(date) === toDateKey(eventStartDate(ev))) {
        return false;
      }
    }
    return isBeforeToday(date);
  }

  isToday(d: Date): boolean {
    return toDateKey(d) === toDateKey(new Date());
  }

  isDomingo(d: Date): boolean {
    return d.getDay() === 0;
  }

  isSabado(d: Date): boolean {
    return d.getDay() === 6;
  }

  isFimDeSemana(d: Date): boolean {
    return this.isDomingo(d) || this.isSabado(d);
  }

  isSelectedDay(d: Date): boolean {
    const k = toDateKey(startOfDay(d));
    return this.selectedDays().some((x) => toDateKey(startOfDay(x)) === k);
  }

  dotsFor(key: string): number {
    return this.events.countByDayKey().get(key) ?? 0;
  }

  dotSlots(count: number): unknown[] {
    const n = Math.min(Math.max(count, 0), 3);
    return Array.from({ length: n });
  }

  toggleDayEventComplete(ev: EventModel): void {
    this.events.toggleCompleted(ev.id);
  }

  async deleteDayEvent(id: string): Promise<void> {
    const ok = await this.confirmacao.pedirConfirmacao({
      titulo: 'Apagar este evento?',
      mensagem: 'Não dá para recuperar depois.',
      textoConfirmar: 'Apagar',
      textoCancelar: 'Cancelar',
      variante: 'perigo',
    });
    if (!ok) {
      return;
    }
    this.events.delete(id);
    this.toast.success('Evento apagado.', 2600);
    if (this.editingId() === id) {
      void this.router.navigateByUrl('/');
    }
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

  openDayEventEdit(ev: MouseEvent, id: string): void {
    ev.stopPropagation();
    void this.router.navigateByUrl(`/event/${id}/edit`);
  }

  save(): void {
    const out = this.commitSave({ skipIntegrationModal: false });
    if (out === 'invalid') {
      this.maybeToastSaveValidation();
      return;
    }
    if (out === 'integration_modal') {
      return;
    }
    void this.router.navigateByUrl('/');
  }

  saveAndAddAnother(): void {
    if (this.editingId()) {
      return;
    }
    const out = this.commitSave({ skipIntegrationModal: true });
    if (out === 'invalid') {
      this.maybeToastSaveValidation();
      return;
    }
    if (out === 'integration_modal') {
      return;
    }
    this.prepareAnotherEventSameDay();
  }

  isPostSaveIntegrationSelected(key: string): boolean {
    return this.postSaveIntegrationSelected().has(key);
  }

  isPostSaveIntegrationMode(mode: PostSaveIntegrationMode): boolean {
    return this.postSaveIntegrationMode() === mode;
  }

  setPostSaveIntegrationMode(mode: PostSaveIntegrationMode): void {
    this.postSaveIntegrationMode.set(mode);
    this.applyPostSaveIntegrationSelection();
  }

  isPostSaveIntegrationWeekday(day: number): boolean {
    return this.postSaveIntegrationWeekdays().has(day);
  }

  togglePostSaveIntegrationWeekday(day: number): void {
    const next = new Set(this.postSaveIntegrationWeekdays());
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    if (next.size === 0) {
      return;
    }
    this.postSaveIntegrationWeekdays.set(next);
    this.applyPostSaveIntegrationSelection();
  }

  postSaveSelectedRows(): PostSaveIntegrationRow[] {
    const selected = this.postSaveIntegrationSelected();
    return this.postSaveIntegrationRows().filter((r) => selected.has(r.key));
  }

  postSaveSelectableCount(): number {
    return this.postSaveIntegrationRows().filter((r) => !r.disabled).length;
  }

  postSaveWeekdayLabel(day: number): string {
    const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return labels[day] ?? String(day);
  }

  dismissPostSaveIntegration(): void {
    this.closePostSaveIntegrationUi();
    void this.router.navigateByUrl('/');
  }

  confirmPostSaveIntegration(): void {
    const tpl = this.postSaveIntegrationTemplate;
    if (!tpl) {
      this.closePostSaveIntegrationUi();
      void this.router.navigateByUrl('/');
      return;
    }
    const st = parseHHMM(tpl.startStr);
    const en = parseHHMM(tpl.endStr);
    if (!st || !en) {
      this.closePostSaveIntegrationUi();
      void this.router.navigateByUrl('/');
      return;
    }
    const keys = [...this.postSaveIntegrationSelected()];
    const rows = this.postSaveIntegrationRows();
    let added = 0;
    for (const key of keys) {
      const row = rows.find((r) => r.key === key);
      if (!row || row.disabled) {
        continue;
      }
      const day = startOfDay(row.date);
      const start = new Date(day);
      start.setHours(st.h, st.m, 0, 0);
      const end = new Date(day);
      end.setHours(en.h, en.m, 0, 0);
      if (!isEndTimeAfterStartSameDay(start, end) || this.hasOverlap(day, start, end, null)) {
        continue;
      }
      this.events.create({
        ...tpl.basePayload,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      added++;
    }
    if (added > 0) {
      this.celebration.playSpark();
      this.toast.success(
        added === 1 ? 'Copiado para mais um dia.' : `Copiado para ${added} dias.`,
        2800,
      );
    }
    this.closePostSaveIntegrationUi();
    void this.router.navigateByUrl('/');
  }

  pickColor(id: string): void {
    this.form.controls.colorKey.setValue(id);
  }

  addTagFromDraft(): void {
    if (this.eventTags().length >= this.maxTags) {
      return;
    }
    const raw = this.form.controls.tagDraft.value.trim().replace(/\s+/g, ' ');
    if (!raw) {
      return;
    }
    const lower = raw.toLocaleLowerCase('pt-BR');
    const dup = this.eventTags().some((t) => t.toLocaleLowerCase('pt-BR') === lower);
    if (dup) {
      return;
    }
    this.eventTags.update((a) => [...a, raw]);
    this.form.controls.tagDraft.setValue('');
  }

  removeTag(index: number): void {
    this.eventTags.update((a) => a.filter((_, i) => i !== index));
  }

  onTagDraftKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.addTagFromDraft();
    }
  }

  onDescriptionSelectionChange(): void {
    this.refreshDescriptionFormatState();
  }

  aoPerderFocoDescricao(): void {
    this.descriptionFormatState.set({ bold: false, italic: false, list: false });
  }

  onDescriptionInput(): void {
    const ed = this.descriptionArea?.nativeElement;
    if (ed) {
      this.form.controls.description.setValue(ed.innerHTML, { emitEvent: false });
      this.form.controls.description.markAsDirty();
    }
    this.refreshDescriptionFormatState();
  }

  aoPressionarTeclaDescricao(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' || ev.shiftKey) {
      return;
    }
    if (!document.queryCommandState('insertUnorderedList')) {
      return;
    }
    ev.preventDefault();
    document.execCommand('insertParagraph', false);
    requestAnimationFrame(() => {
      this.onDescriptionInput();
      this.refreshDescriptionFormatState();
    });
  }

  applyDescriptionFormat(mode: 'bold' | 'italic' | 'list'): void {
    const ed = this.descriptionArea?.nativeElement;
    if (!ed) {
      return;
    }
    ed.focus();
    const cmd = mode === 'bold' ? 'bold' : mode === 'italic' ? 'italic' : 'insertUnorderedList';
    document.execCommand(cmd, false);
    requestAnimationFrame(() => {
      this.onDescriptionInput();
      this.refreshDescriptionFormatState();
    });
  }

  private refreshDescriptionFormatState(): void {
    const ed = this.descriptionArea?.nativeElement;
    if (!ed) {
      this.descriptionFormatState.set({ bold: false, italic: false, list: false });
      return;
    }
    if (!focoEstaNoEditor(ed)) {
      this.descriptionFormatState.set({ bold: false, italic: false, list: false });
      return;
    }
    const hasBold = document.queryCommandState('bold');
    const hasItalic = document.queryCommandState('italic');
    const hasList = document.queryCommandState('insertUnorderedList');
    this.descriptionFormatState.set({
      bold: !!hasBold,
      italic: !!hasItalic,
      list: hasList,
    });
  }

  private syncDescriptionEditorFromForm(): void {
    const ed = this.descriptionArea?.nativeElement;
    if (!ed) {
      return;
    }
    const raw = this.form.controls.description.value ?? '';
    if (!raw.trim()) {
      ed.innerHTML = '';
      this.refreshDescriptionFormatState();
      return;
    }
    if (pareceHtml(raw)) {
      ed.innerHTML = raw;
    } else {
      ed.innerHTML = markdownLikeToHtml(raw);
    }
    this.refreshDescriptionFormatState();
  }

  private normalizeDescriptionForSave(raw: string): string | undefined {
    const t = String(raw ?? '').trim();
    if (!t) {
      return undefined;
    }
    if (!pareceHtml(t)) {
      return t;
    }
    const d = document.createElement('div');
    d.innerHTML = t;
    const plain = (d.textContent ?? '').replace(/\s+/g, ' ').trim();
    return plain ? t : undefined;
  }

  tagAddDisabled(): boolean {
    return (
      this.eventTags().length >= this.maxTags ||
      !this.form.controls.tagDraft.value.trim()
    );
  }

  onTimeDigitInput(side: TimeSide, part: TimePart, ev: Event): void {
    const el = ev.target as HTMLInputElement;
    let v = el.value.replace(/\D/g, '').slice(0, 2);
    if (part === 'h') {
      if (v.length === 2) {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n > 23) {
          v = '23';
        }
      }
    } else if (v.length === 2) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n > 59) {
        v = '59';
      }
    }
    const cur = this.timeUi();
    const nextSide: TimePair = { ...cur[side], [part]: v };
    this.timeUi.set({ ...cur, [side]: nextSide });
    this.syncFormFromUi();
    if (part === 'h' && v.length === 2) {
      const wrap = el.closest('.time-segmented');
      const inputs = wrap?.querySelectorAll<HTMLInputElement>('.time-segmented__digits');
      const minuteInput = inputs?.[1];
      if (minuteInput && document.activeElement === el) {
        requestAnimationFrame(() => minuteInput.focus());
      }
    }
  }

  onTimeDigitBlur(side: TimeSide): void {
    const cur = this.timeUi();
    const p = cur[side];
    const hn = p.h === '' ? 0 : Math.min(23, Math.max(0, parseInt(p.h, 10) || 0));
    const mn = p.m === '' ? 0 : Math.min(59, Math.max(0, parseInt(p.m, 10) || 0));
    this.timeUi.set({
      ...cur,
      [side]: { h: pad2(hn), m: pad2(mn) },
    });
    this.syncFormFromUi();
    const c = side === 'start' ? this.form.controls.startTime : this.form.controls.endTime;
    c.markAsTouched();
    c.updateValueAndValidity({ onlySelf: true });
  }

  timeFieldInvalid(ctrl: 'startTime' | 'endTime'): boolean {
    const c = this.form.controls[ctrl];
    return !!(c.touched && c.invalid && (c.hasError('required') || c.hasError('clock')));
  }

  /** Início e fim válidos em relógio, mas fim ≤ início. */
  orderTimeInvalid(): boolean {
    const day = this.selectedDay();
    if (!day || this.form.controls.startTime.disabled) {
      return false;
    }
    const startStr = normalizeToHHMM(String(this.form.getRawValue().startTime).trim());
    const endStr = normalizeToHHMM(String(this.form.getRawValue().endTime).trim());
    if (!startStr || !endStr) {
      return false;
    }
    const a = parseHHMM(startStr);
    const b = parseHHMM(endStr);
    if (!a || !b) {
      return false;
    }
    const start = new Date(startOfDay(day));
    start.setHours(a.h, a.m, 0, 0);
    const end = new Date(startOfDay(day));
    end.setHours(b.h, b.m, 0, 0);
    return !isEndTimeAfterStartSameDay(start, end);
  }

  private maybeToastSaveValidation(): void {
    const days = this.selectedDays();
    if (!days.length || this.form.controls.startTime.disabled) {
      return;
    }
    if (this.form.controls.title.invalid || !this.form.controls.title.value.trim()) {
      this.toast.error('Falta o título.');
      return;
    }
    const stStr = normalizeToHHMM(String(this.form.getRawValue().startTime).trim());
    const enStr = normalizeToHHMM(String(this.form.getRawValue().endTime).trim());
    const st = stStr ? parseHHMM(stStr) : null;
    const en = enStr ? parseHHMM(enStr) : null;
    if (!st || !en) {
      this.toast.error('Confere as horas de início e fim.');
      return;
    }
    const exclude = this.editingId();
    for (const day of days) {
      const startD = new Date(startOfDay(day));
      startD.setHours(st.h, st.m, 0, 0);
      const endD = new Date(startOfDay(day));
      endD.setHours(en.h, en.m, 0, 0);
      if (!isEndTimeAfterStartSameDay(startD, endD)) {
        this.toast.error('O fim tem de ser depois do início.');
        return;
      }
      if (this.hasOverlap(day, startD, endD, exclude)) {
        this.toast.error('Esse horário já está ocupado nesse dia.');
        return;
      }
    }
  }

  /**
   * `integration_modal` — aguarda o utilizador no modal (só criação, um dia, sem multi-seleção no calendário).
   */
  private commitSave(options: { skipIntegrationModal: boolean }): 'invalid' | 'done' | 'integration_modal' {
    const days = this.selectedDays();
    if (!days.length || this.form.controls.startTime.disabled) {
      return 'invalid';
    }
    this.syncTimeControlsValidity();
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.form.controls.title.value.trim()) {
      return 'invalid';
    }
    const raw = this.form.getRawValue();
    const startStr = normalizeToHHMM(String(raw.startTime).trim());
    const endStr = normalizeToHHMM(String(raw.endTime).trim());
    if (!startStr || !endStr) {
      return 'invalid';
    }
    const st = parseHHMM(startStr);
    const en = parseHHMM(endStr);
    if (!st || !en) {
      return 'invalid';
    }
    const idEdit = this.editingId();
    const tags = this.eventTags();
    const basePayload = {
      title: raw.title.trim(),
      subtitle: raw.subtitle.trim() || undefined,
      description: this.normalizeDescriptionForSave(raw.description),
      tags: tags.length ? [...tags] : undefined,
      colorKey: raw.colorKey || 'default',
    };

    if (idEdit) {
      const day = days[0]!;
      const start = new Date(startOfDay(day));
      start.setHours(st.h, st.m, 0, 0);
      const end = new Date(startOfDay(day));
      end.setHours(en.h, en.m, 0, 0);
      if (!isEndTimeAfterStartSameDay(start, end)) {
        return 'invalid';
      }
      if (this.hasOverlap(day, start, end, idEdit)) {
        return 'invalid';
      }
      const prev = this.events.all().find((e) => e.id === idEdit);
      this.events.update(idEdit, {
        ...basePayload,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        completed: prev?.completed,
      });
      this.celebration.playSpark();
      this.toast.success('Guardado.', 2400);
      return 'done';
    }

    for (const day of days) {
      if (isBeforeToday(day)) {
        return 'invalid';
      }
      const start = new Date(startOfDay(day));
      start.setHours(st.h, st.m, 0, 0);
      const end = new Date(startOfDay(day));
      end.setHours(en.h, en.m, 0, 0);
      if (!isEndTimeAfterStartSameDay(start, end)) {
        return 'invalid';
      }
      if (this.hasOverlap(day, start, end, null)) {
        return 'invalid';
      }
    }
    for (const day of days) {
      const start = new Date(startOfDay(day));
      start.setHours(st.h, st.m, 0, 0);
      const end = new Date(startOfDay(day));
      end.setHours(en.h, en.m, 0, 0);
      this.events.create({
        ...basePayload,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
    }
    this.celebration.playSpark();
    this.toast.success(
      days.length > 1 ? `${days.length} eventos guardados.` : 'Guardado.',
      2600,
    );

    const integrationRows =
      !options.skipIntegrationModal && !this.multiCalendarPick() && days.length === 1
        ? this.buildPostSaveIntegrationRows(days[0]!, startStr, endStr)
        : [];
    const offerIntegration = integrationRows.some((r) => !r.disabled);

    if (offerIntegration) {
      this.openPostSaveIntegration(integrationRows, startStr, endStr, basePayload);
      return 'integration_modal';
    }
    return 'done';
  }

  private buildPostSaveIntegrationRows(anchor: Date, startStr: string, endStr: string): PostSaveIntegrationRow[] {
    const st = parseHHMM(startStr);
    const en = parseHHMM(endStr);
    if (!st || !en) {
      return [];
    }
    const anchorKey = toDateKey(startOfDay(anchor));
    const mon = startOfWeekMonday(startOfDay(anchor));
    const dfWeekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
    const dfDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    const rows: PostSaveIntegrationRow[] = [];
    for (let i = 0; i < 7; i++) {
      const d = startOfDay(addDays(mon, i));
      const key = toDateKey(d);
      if (key === anchorKey) {
        continue;
      }
      if (isBeforeToday(d)) {
        continue;
      }
      const start = new Date(d);
      start.setHours(st.h, st.m, 0, 0);
      const end = new Date(d);
      end.setHours(en.h, en.m, 0, 0);
      const overlap = this.hasOverlap(d, start, end, null);
      const label = `${dfWeekday.format(d)} · ${dfDate.format(d)}`;
      rows.push({
        key,
        date: d,
        label,
        disabled: overlap,
        disabledReason: overlap ? 'Horário ocupado neste dia' : undefined,
      });
    }
    return rows;
  }

  private openPostSaveIntegration(
    rows: PostSaveIntegrationRow[],
    startStr: string,
    endStr: string,
    basePayload: PostSaveIntegrationTemplate['basePayload'],
  ): void {
    this.postSaveIntegrationTemplate = { basePayload, startStr, endStr };
    this.postSaveIntegrationRows.set(rows);
    this.postSaveIntegrationMode.set('all');
    this.postSaveIntegrationWeekdays.set(new Set([1, 2, 3, 4, 5]));
    this.applyPostSaveIntegrationSelection();
    this.postSaveIntegrationOpen.set(true);
  }

  private closePostSaveIntegrationUi(): void {
    this.postSaveIntegrationOpen.set(false);
    this.postSaveIntegrationRows.set([]);
    this.postSaveIntegrationSelected.set(new Set());
    this.postSaveIntegrationMode.set('all');
    this.postSaveIntegrationWeekdays.set(new Set([1, 2, 3, 4, 5]));
    this.postSaveIntegrationTemplate = null;
  }

  private applyPostSaveIntegrationSelection(): void {
    const rows = this.postSaveIntegrationRows().filter((r) => !r.disabled);
    const mode = this.postSaveIntegrationMode();
    const selected = new Set<string>();
    for (const row of rows) {
      const wd = row.date.getDay(); // 0=Dom ... 6=Sáb
      const include =
        mode === 'all'
          ? true
          : mode === 'weekdays'
            ? wd >= 1 && wd <= 5
            : mode === 'weekend'
              ? wd === 0 || wd === 6
              : this.postSaveIntegrationWeekdays().has(wd);
      if (include) {
        selected.add(row.key);
      }
    }
    this.postSaveIntegrationSelected.set(selected);
  }

  private applyEventToForm(ev: EventModel): void {
    const d = startOfDay(eventStartDate(ev));
    this.selectedDays.set([d]);
    this.multiCalendarPick.set(false);
    this.monthAnchor.set(d);
    const sDate = new Date(ev.startDate);
    const eDate = new Date(ev.endDate ?? ev.startDate);
    this.form.controls.startTime.enable();
    this.form.controls.endTime.enable();
    this.form.patchValue({
      title: ev.title,
      subtitle: ev.subtitle ?? '',
      description: ev.description ?? '',
      colorKey: ev.colorKey ?? 'default',
      startTime: `${pad2(sDate.getHours())}:${pad2(sDate.getMinutes())}`,
      endTime: `${pad2(eDate.getHours())}:${pad2(eDate.getMinutes())}`,
      tagDraft: '',
    });
    this.eventTags.set(ev.tags?.length ? [...ev.tags] : []);
    this.form.controls.startTime.updateValueAndValidity({ onlySelf: true });
    this.form.controls.endTime.updateValueAndValidity({ onlySelf: true });
    this.syncDescriptionEditorFromForm();
    this.syncUiFromForm();
  }

  private syncUiFromForm(): void {
    const sh = normalizeToHHMM(String(this.form.getRawValue().startTime).trim());
    const eh = normalizeToHHMM(String(this.form.getRawValue().endTime).trim());
    const a = sh ? parseHHMM(sh) : null;
    const b = eh ? parseHHMM(eh) : null;
    if (!a || !b) {
      return;
    }
    this.timeUi.set({
      start: { h: pad2(a.h), m: pad2(a.m) },
      end: { h: pad2(b.h), m: pad2(b.m) },
    });
  }

  private syncFormFromUi(): void {
    const u = this.timeUi();
    const startStr = this.partsToHHMM(u.start);
    const endStr = this.partsToHHMM(u.end);
    this.form.patchValue({ startTime: startStr, endTime: endStr }, { emitEvent: false });
    this.form.controls.startTime.updateValueAndValidity({ onlySelf: true });
    this.form.controls.endTime.updateValueAndValidity({ onlySelf: true });
  }

  private partsToHHMM(p: TimePair): string {
    const h = p.h === '' ? 0 : Math.min(23, Math.max(0, parseInt(p.h, 10) || 0));
    const m = p.m === '' ? 0 : Math.min(59, Math.max(0, parseInt(p.m, 10) || 0));
    return `${pad2(h)}:${pad2(m)}`;
  }

  private syncTimeControlsValidity(): void {
    for (const key of ['startTime', 'endTime'] as const) {
      const c = this.form.controls[key];
      const n = normalizeToHHMM(String(c.value ?? '').trim());
      if (n) {
        c.setValue(n, { emitEvent: false });
      }
      c.updateValueAndValidity({ onlySelf: true });
    }
    this.syncUiFromForm();
  }

  private hasOverlap(day: Date, candStart: Date, candEnd: Date, excludeId: string | null): boolean {
    const key = toDateKey(day);
    for (const e of this.events.all()) {
      if (excludeId && e.id === excludeId) {
        continue;
      }
      if (toDateKey(eventStartDate(e)) !== key) {
        continue;
      }
      const o0 = new Date(e.startDate);
      const o1 = new Date(e.endDate ?? e.startDate);
      if (timeIntervalsOverlap(candStart, candEnd, o0, o1)) {
        return true;
      }
    }
    return false;
  }

  private prepareAnotherEventSameDay(): void {
    const anchor = this.selectedDay() ?? startOfDay(new Date());
    this.selectedDays.set([anchor]);
    this.multiCalendarPick.set(false);
    const prevEnd = this.form.getRawValue().endTime;
    const nextStart = parseHHMM(prevEnd) ? prevEnd : clockNowHHMM();
    this.eventTags.set([]);
    this.form.patchValue({
      title: '',
      subtitle: '',
      description: '',
      tagDraft: '',
      colorKey: 'default',
      startTime: nextStart,
      endTime: addOneHourHHMM(nextStart),
    });
    this.form.controls.title.markAsUntouched();
    this.form.controls.subtitle.markAsUntouched();
    this.form.controls.description.markAsUntouched();
    this.form.controls.tagDraft.markAsUntouched();
    this.form.controls.startTime.markAsUntouched();
    this.form.controls.endTime.markAsUntouched();
    this.syncDescriptionEditorFromForm();
    this.syncUiFromForm();
  }

  private clearDaySelection(): void {
    this.selectedDays.set([]);
    this.form.controls.startTime.disable();
    this.form.controls.endTime.disable();
  }

  private ensureTimesWhenDaySelected(): void {
    if (!this.selectedDays().length || this.form.controls.startTime.disabled) {
      return;
    }
    const rawS = this.form.getRawValue().startTime;
    const rawE = this.form.getRawValue().endTime;
    if (!normalizeToHHMM(String(rawS).trim())) {
      this.form.controls.startTime.setValue(clockNowHHMM());
    }
    if (!normalizeToHHMM(String(rawE).trim())) {
      this.form.controls.endTime.setValue(addOneHourHHMM(this.form.getRawValue().startTime));
    }
    this.syncUiFromForm();
  }
}
