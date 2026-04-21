import {
  afterNextRender,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { EventModel } from '../../shared/models/event.model';
import { LocalEventsService } from '../../core/services/local-events.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { LocalNotesService } from '../../core/services/local-notes.service';
import { ToastService } from '../../core/services/toast.service';
import { DayHoverCardDirective } from '../../shared/directives/day-hover-card.directive';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import {
  Calendar1,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  CircleCheck,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Heading,
  LucideAngularModule,
  Pencil,
  Tag,
  Trash2,
  X,
} from 'lucide-angular';
import { eventAccentColor } from '../../shared/constants/event-colors';
import {
  addDays,
  addMonths,
  buildMonthGridCells,
  endOfWeekMonday,
  eventStartDate,
  formatEventTimeRange,
  startOfDay,
  startOfWeekMonday,
  toDateKey,
} from '../../shared/utils/date.utils';
import { escaparHtml, extrairTextoDeHtml, pareceHtml } from '../../shared/utils/html-text.utils';

interface EventCardTimeParts {
  sh: string;
  sm: string;
  eh?: string;
  em?: string;
}

export type CalendarView = 'day' | 'week' | 'month';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [LucideAngularModule, TooltipDirective, DayHoverCardDirective],
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
export class CalendarPage {
  readonly iconDay = Calendar1;
  readonly iconWeek = CalendarRange;
  readonly iconMonth = CalendarDays;
  readonly iconPrev = ChevronLeft;
  readonly iconNext = ChevronRight;
  readonly iconTrash = Trash2;
  readonly iconCheck = CircleCheck;
  readonly iconCircle = Circle;
  readonly iconCalendarPlus = CalendarPlus;
  readonly iconPencil = Pencil;
  readonly iconClose = X;
  readonly iconClock = Clock;
  readonly iconHeading = Heading;
  readonly iconFileText = FileText;
  readonly iconTag = Tag;

  private readonly store = inject(LocalEventsService);
  private readonly notesStore = inject(LocalNotesService);
  private readonly confirmacao = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  /** Começa no mês. Novo evento: rota `/event/new`; dias passados não entram. */
  readonly view = signal<CalendarView>('month');
  readonly anchor = signal<Date>(new Date());

  readonly title = computed(() => this.formatTitle(this.anchor(), this.view()));

  /** Sempre o dia âncora (em semana/mês o chip ou o dia ativo define qual dia). */
  readonly filteredEvents = computed(() => this.filterDay(this.store.all(), this.anchor()));

  readonly monthGrid = computed(() => buildMonthGridCells(this.anchor()));

  readonly weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  /** Data do dia selecionado (âncora) para o cabeçalho da lista. */
  readonly anchorDayTitle = computed(() => {
    const d = this.anchor();
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(d);
  });

  /** Primeiro evento por horário de início (para alinhar a lista ao abrir ou mudar o dia). */
  readonly firstVisibleEventId = computed((): string | null => {
    const evs = this.filteredEvents();
    if (evs.length === 0) {
      return null;
    }
    return [...evs].sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!.id;
  });

  /** Detalhe do evento (modal). */
  readonly dayDetailEvent = signal<EventModel | null>(null);

  constructor() {
    effect(() => {
      this.anchor();
      this.view();
      this.firstVisibleEventId();
      afterNextRender(() => this.scrollListToFirstEvent(), { injector: this.injector });
    });

    effect((onCleanup) => {
      const doc = globalThis.document;
      if (!doc?.body) {
        return;
      }
      if (this.dayDetailEvent()) {
        doc.body.style.overflow = 'hidden';
      } else {
        doc.body.style.overflow = '';
      }
      onCleanup(() => {
        doc.body.style.overflow = '';
      });
    });
  }

  /** Rola a lista do dia até o primeiro evento (mais cedo). */
  private scrollListToFirstEvent(): void {
    const root = this.host.nativeElement;
    const firstId = this.firstVisibleEventId();
    if (!firstId) {
      const list = root.querySelector('.list') as HTMLElement | null;
      if (list) {
        list.scrollTop = 0;
      }
      return;
    }
    const target = root.querySelector(`[data-scroll-list-first="${firstId}"]`) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'auto', inline: 'nearest' });
    }
  }

  setView(v: CalendarView): void {
    this.view.set(v);
  }

  /** Ícone do cabeçalho da lista conforme a vista (dia / semana / mês). */
  listEventsIcon() {
    return this.view() === 'week' ? this.iconWeek : this.iconDay;
  }

  goPrev(): void {
    const v = this.view();
    this.anchor.update((d) => {
      if (v === 'day') {
        return addDays(d, -1);
      }
      if (v === 'week') {
        return addDays(d, -7);
      }
      return addMonths(d, -1);
    });
  }

  goNext(): void {
    const v = this.view();
    this.anchor.update((d) => {
      if (v === 'day') {
        return addDays(d, 1);
      }
      if (v === 'week') {
        return addDays(d, 7);
      }
      return addMonths(d, 1);
    });
  }

  pickDay(date: Date): void {
    this.anchor.set(startOfDay(date));
  }

  pickWeekDay(offset: number): void {
    const start = startOfWeekMonday(this.anchor());
    this.anchor.set(addDays(start, offset));
  }

  async deleteEvent(id: string): Promise<void> {
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
    if (this.dayDetailEvent()?.id === id) {
      this.closeDayDetail();
    }
    this.store.delete(id);
    this.toast.success('Evento apagado.', 2600);
  }

  openEventEdit(ev: MouseEvent, id: string): void {
    ev.stopPropagation();
    void this.router.navigateByUrl(`/event/${id}/edit`);
  }

  @HostListener('document:keydown.escape')
  onEscapeCloseDayDetail(): void {
    if (this.dayDetailEvent()) {
      this.closeDayDetail();
    }
  }

  openDayDetail(ev: EventModel): void {
    const fresh = this.store.all().find((e) => e.id === ev.id) ?? ev;
    this.dayDetailEvent.set(fresh);
  }

  closeDayDetail(): void {
    this.dayDetailEvent.set(null);
  }

  editEventFromDetail(id: string): void {
    this.closeDayDetail();
    void this.router.navigateByUrl(`/event/${id}/edit`);
  }

  /** Atualiza o estado no modal após `toggleComplete`. */
  toggleCompleteInDetail(ev: EventModel): void {
    this.toggleComplete(ev);
    const next = this.store.all().find((e) => e.id === ev.id);
    if (next) {
      this.dayDetailEvent.set(next);
    }
  }

  /** Evita que a roda no fundo faça scroll por baixo do modal (o `body` já fica com overflow oculto). */
  onDayDetailBackdropWheel(ev: WheelEvent): void {
    if (!this.dayDetailEvent()) {
      return;
    }
    ev.preventDefault();
  }

  dayDetailDescription(ev: EventModel): string {
    const t = ev.description?.trim();
    return t ? this.eventDescriptionHtml(t) : 'Sem descrição.';
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

  onEventCardClick(event: MouseEvent, ev: EventModel): void {
    const t = event.target as HTMLElement | null;
    if (t?.closest('button') || t?.closest('.card-actions')) {
      return;
    }
    this.openDayDetail(ev);
  }

  toggleComplete(ev: EventModel): void {
    this.store.toggleCompleted(ev.id);
  }

  private filterDay(all: EventModel[], a: Date): EventModel[] {
    const key = toDateKey(a);
    const filtered = all.filter((e) => toDateKey(eventStartDate(e)) === key);
    return this.sortByPendingThenStart(filtered);
  }

  /** Pendentes primeiro, depois por horário de início. */
  private sortByPendingThenStart(list: EventModel[]): EventModel[] {
    return [...list].sort((a, b) => {
      const ac = a.completed ? 1 : 0;
      const bc = b.completed ? 1 : 0;
      if (ac !== bc) {
        return ac - bc;
      }
      return a.startDate.localeCompare(b.startDate);
    });
  }

  private formatTitle(d: Date, v: CalendarView): string {
    const df = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    if (v === 'day') {
      return df.format(d);
    }
    if (v === 'week') {
      const s = startOfWeekMonday(d);
      const e = endOfWeekMonday(d);
      const short = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
      return `${short.format(s)} – ${short.format(e)}`;
    }
    const m = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
    return m.format(d);
  }

  formatEventRange(ev: EventModel): string {
    return formatEventTimeRange(ev);
  }

  /** HH:mm para o cartão — mesmo vocabulário visual que o criador (`.time-segmented`). */
  eventCardTimeParts(ev: EventModel): EventCardTimeParts {
    const padH = (n: number) =>
      String(Math.max(0, Math.min(23, Number.isFinite(n) ? Math.trunc(n) : 0))).padStart(2, '0');
    const padM = (n: number) =>
      String(Math.max(0, Math.min(59, Number.isFinite(n) ? Math.trunc(n) : 0))).padStart(2, '0');
    const s = eventStartDate(ev);
    const sh = padH(s.getHours());
    const sm = padM(s.getMinutes());
    const endIso = ev.endDate?.trim();
    if (!endIso) {
      return { sh, sm };
    }
    const e = new Date(endIso);
    if (Number.isNaN(e.getTime())) {
      return { sh, sm };
    }
    return { sh, sm, eh: padH(e.getHours()), em: padM(e.getMinutes()) };
  }

  /** Uma linha de resumo (subtítulo e/ou descrição) para o cartão em grelha 3×1. */
  cardSummaryLine(ev: EventModel): string {
    const sub = ev.subtitle?.trim();
    const desc = this.cardDescriptionPreview(ev);
    if (sub && desc) {
      const joined = `${sub} — ${desc}`;
      return joined.length > 160 ? `${joined.slice(0, 158).trim()}…` : joined;
    }
    return sub || desc || '';
  }

  /** Etiquetas para `title` no `<li>` quando existirem. */
  cardTagsTooltip(ev: EventModel): string | null {
    return ev.tags?.length ? `Etiquetas: ${ev.tags.join(', ')}` : null;
  }

  /** Texto plano da descrição para o cartão (sem HTML), com corte suave. */
  cardDescriptionPreview(ev: EventModel): string {
    const raw = ev.description?.trim();
    if (!raw) {
      return '';
    }
    const plain = pareceHtml(raw) ? extrairTextoDeHtml(raw) : raw.replace(/\s+/g, ' ').trim();
    if (!plain) {
      return '';
    }
    const max = 200;
    if (plain.length <= max) {
      return plain;
    }
    const cut = plain.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    const base = lastSpace > 48 ? cut.slice(0, lastSpace) : cut.slice(0, max - 1);
    return `${base}…`;
  }

  eventAccent(ev: EventModel): string {
    return eventAccentColor(ev.colorKey);
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

  isAnchorDay(d: Date): boolean {
    return toDateKey(d) === toDateKey(this.anchor());
  }

  dotsFor(key: string): number {
    return this.store.countByDayKey().get(key) ?? 0;
  }

  noteCountFor(key: string): number {
    return this.notesStore.countByDayKey().get(key) ?? 0;
  }

  dotSlots(count: number): unknown[] {
    const n = Math.min(Math.max(count, 0), 3);
    return Array.from({ length: n });
  }

  weekRangeLabels(): { offset: number; label: string; sub: string; active: boolean; domingo: boolean; sabado: boolean }[] {
    const start = startOfWeekMonday(this.anchor());
    const fmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return {
        offset: i,
        label: fmt.format(d).replace('.', ''),
        sub: String(d.getDate()),
        active: toDateKey(d) === toDateKey(this.anchor()),
        domingo: this.isDomingo(d),
        sabado: this.isSabado(d),
      };
    });
  }
}
