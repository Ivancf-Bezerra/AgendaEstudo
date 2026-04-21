import { DOCUMENT } from '@angular/common';
import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  inject,
  Renderer2,
} from '@angular/core';
import { Router } from '@angular/router';
import { LocalEventsService } from '../../core/services/local-events.service';
import { LocalNotesService } from '../../core/services/local-notes.service';
import { QuickNoteUiService } from '../../core/services/quick-note-ui.service';
import type { EventModel } from '../models/event.model';
import type { NoteModel } from '../models/note.model';
import { eventAccentColor } from '../constants/event-colors';
import {
  eventStartDate,
  formatEventTimeRange,
  parseDateKey,
  toDateKey,
} from '../utils/date.utils';
import { extrairTextoDeHtml } from '../utils/html-text.utils';

const MAX_EVENT_ROWS = 4;
const MAX_NOTE_ROWS = 4;

function sortDayEvents(list: EventModel[]): EventModel[] {
  return [...list].sort((a, b) => {
    const ac = a.completed ? 1 : 0;
    const bc = b.completed ? 1 : 0;
    if (ac !== bc) {
      return ac - bc;
    }
    return a.startDate.localeCompare(b.startDate);
  });
}

function sortDayNotes(list: NoteModel[]): NoteModel[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Card flutuante com eventos e notas do dia (vista mês) — clicável para abrir edição ou a lista. */
@Directive({
  selector: '[appDayHoverCard]',
  standalone: true,
})
export class DayHoverCardDirective implements OnDestroy {
  @Input({ alias: 'appDayHoverCard' }) appDayHoverCard = '';

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly eventsStore = inject(LocalEventsService);
  private readonly notesStore = inject(LocalNotesService);
  private readonly router = inject(Router);
  private readonly quickNotes = inject(QuickNoteUiService);

  private readonly cardId = `app-day-card-${crypto.randomUUID()}`;
  private card: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onScroll = (): void => this.hideNow();
  private unlistenFns: Array<() => void> = [];

  private readonly dateTitleFmt = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  ngOnDestroy(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.hideNow();
    this.doc.defaultView?.removeEventListener('scroll', this.onScroll, true);
  }

  @HostListener('mouseenter')
  onEnter(): void {
    const key = this.appDayHoverCard?.trim();
    if (!key) {
      return;
    }
    this.clearShowTimer();
    this.clearHideTimer();
    this.showTimer = setTimeout(() => this.show(key), 260);
  }

  @HostListener('mouseleave', ['$event'])
  onLeave(ev: MouseEvent): void {
    this.clearShowTimer();
    const to = ev.relatedTarget as Node | null;
    if (this.card && to && this.card.contains(to)) {
      return;
    }
    this.scheduleHide(140);
  }

  private clearShowTimer(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private scheduleHide(ms: number): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.hideNow(), ms);
  }

  private onCardEnter(): void {
    this.clearHideTimer();
  }

  private onCardLeave(ev: MouseEvent): void {
    const to = ev.relatedTarget as Node | null;
    if (this.el.nativeElement.contains(to)) {
      return;
    }
    this.scheduleHide(80);
  }

  private show(dayKey: string): void {
    if (this.card) {
      return;
    }
    const allEv = this.eventsStore.all();
    const dayEvents = sortDayEvents(allEv.filter((e) => toDateKey(eventStartDate(e)) === dayKey));
    const dayNotes = sortDayNotes(this.notesStore.all().filter((n) => n.dayKey === dayKey));
    if (dayEvents.length === 0 && dayNotes.length === 0) {
      return;
    }

    const wrap = this.renderer.createElement('div');
    this.renderer.setAttribute(wrap, 'role', 'tooltip');
    this.renderer.setAttribute(wrap, 'id', this.cardId);
    this.renderer.addClass(wrap, 'app-day-hover-card');
    this.renderer.listen(wrap, 'mouseenter', () => this.onCardEnter());
    this.renderer.listen(wrap, 'mouseleave', (e: Event) => this.onCardLeave(e as MouseEvent));
    this.renderer.appendChild(this.doc.body, wrap);
    this.card = wrap;

    const host = this.el.nativeElement;
    this.renderer.setAttribute(host, 'aria-describedby', this.cardId);

    const dateRef = parseDateKey(dayKey);
    const title = this.renderer.createElement('p');
    this.renderer.addClass(title, 'app-day-hover-card__title');
    title.textContent = this.capitalizeFirst(this.dateTitleFmt.format(dateRef));
    this.renderer.appendChild(wrap, title);

    if (dayEvents.length) {
      const sub = this.renderer.createElement('p');
      this.renderer.addClass(sub, 'app-day-hover-card__section');
      sub.textContent = 'Eventos';
      this.renderer.appendChild(wrap, sub);
      const list = this.renderer.createElement('div');
      this.renderer.addClass(list, 'app-day-hover-card__list');
      const shown = dayEvents.slice(0, MAX_EVENT_ROWS);
      for (const ev of shown) {
        this.renderer.appendChild(list, this.buildEventButton(ev));
      }
      this.renderer.appendChild(wrap, list);
      const rest = dayEvents.length - shown.length;
      if (rest > 0) {
        this.renderer.appendChild(wrap, this.buildMore(`+${rest} ${rest === 1 ? 'evento' : 'eventos'}`));
      }
    }

    if (dayNotes.length) {
      const sub = this.renderer.createElement('p');
      this.renderer.addClass(sub, 'app-day-hover-card__section');
      sub.textContent = 'Notas';
      this.renderer.appendChild(wrap, sub);
      const list = this.renderer.createElement('div');
      this.renderer.addClass(list, 'app-day-hover-card__list');
      const shown = dayNotes.slice(0, MAX_NOTE_ROWS);
      for (const n of shown) {
        this.renderer.appendChild(list, this.buildNoteButton(n));
      }
      this.renderer.appendChild(wrap, list);
      const rest = dayNotes.length - shown.length;
      if (rest > 0) {
        this.renderer.appendChild(wrap, this.buildMore(`+${rest} ${rest === 1 ? 'nota' : 'notas'}`));
      }
    }

    this.doc.defaultView?.addEventListener('scroll', this.onScroll, true);
    this.positionCard();
    requestAnimationFrame(() => this.positionCard());
  }

  private buildMore(text: string): HTMLElement {
    const more = this.renderer.createElement('p');
    this.renderer.addClass(more, 'app-day-hover-card__more');
    more.textContent = text;
    return more;
  }

  private buildEventButton(ev: EventModel): HTMLElement {
    const btn = this.renderer.createElement('button');
    this.renderer.setAttribute(btn, 'type', 'button');
    this.renderer.addClass(btn, 'app-day-hover-card__row');
    this.renderer.addClass(btn, 'app-day-hover-card__row--event');
    this.renderer.setStyle(btn, 'border-left-color', eventAccentColor(ev.colorKey));
    this.unlistenFns.push(
      this.renderer.listen(btn, 'click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        void this.router.navigateByUrl(`/event/${ev.id}/edit`);
        this.hideNow();
      }),
    );

    const meta = this.renderer.createElement('p');
    this.renderer.addClass(meta, 'app-day-hover-card__meta');
    meta.textContent = formatEventTimeRange(ev);
    this.renderer.appendChild(btn, meta);

    const name = this.renderer.createElement('p');
    this.renderer.addClass(name, 'app-day-hover-card__name');
    name.textContent = ev.completed ? `${ev.title} (concluído)` : ev.title;
    this.renderer.appendChild(btn, name);

    if (ev.subtitle?.trim()) {
      const sub = this.renderer.createElement('p');
      this.renderer.addClass(sub, 'app-day-hover-card__sub');
      sub.textContent = this.truncate(ev.subtitle.trim(), 72);
      this.renderer.appendChild(btn, sub);
    }

    return btn;
  }

  private buildNoteButton(n: NoteModel): HTMLElement {
    const btn = this.renderer.createElement('button');
    this.renderer.setAttribute(btn, 'type', 'button');
    this.renderer.addClass(btn, 'app-day-hover-card__row');
    this.renderer.addClass(btn, 'app-day-hover-card__row--note');
    this.unlistenFns.push(
      this.renderer.listen(btn, 'click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.quickNotes.openEdit(n.id);
        this.hideNow();
      }),
    );

    const meta = this.renderer.createElement('p');
    this.renderer.addClass(meta, 'app-day-hover-card__meta');
    const t = new Date(n.createdAt);
    meta.textContent = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.renderer.appendChild(btn, meta);

    const name = this.renderer.createElement('p');
    this.renderer.addClass(name, 'app-day-hover-card__name');
    name.textContent = this.truncate(this.noteTitle(n), 96);
    this.renderer.appendChild(btn, name);

    return btn;
  }

  private noteTitle(n: NoteModel): string {
    const plain = extrairTextoDeHtml(n.bodyHtml);
    return plain.length ? plain : 'Nota';
  }

  private truncate(s: string, max: number): string {
    if (s.length <= max) {
      return s;
    }
    return `${s.slice(0, max - 1)}…`;
  }

  private capitalizeFirst(s: string): string {
    if (!s) {
      return s;
    }
    return s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
  }

  private positionCard(): void {
    if (!this.card) {
      return;
    }
    const host = this.el.nativeElement;
    const rect = host.getBoundingClientRect();
    const margin = 8;
    const cr = this.card.getBoundingClientRect();
    let top = rect.bottom + margin;
    let left = rect.left + rect.width / 2 - cr.width / 2;

    const vw = this.doc.defaultView?.innerWidth ?? 800;
    const vh = this.doc.defaultView?.innerHeight ?? 600;
    const pad = 6;
    left = Math.max(pad, Math.min(left, vw - cr.width - pad));
    top = Math.max(pad, Math.min(top, vh - cr.height - pad));

    this.renderer.setStyle(this.card, 'position', 'fixed');
    this.renderer.setStyle(this.card, 'top', `${top}px`);
    this.renderer.setStyle(this.card, 'left', `${left}px`);
    this.renderer.setStyle(this.card, 'z-index', '10000');
  }

  private hideNow(): void {
    this.clearHideTimer();
    const host = this.el.nativeElement;
    for (const u of this.unlistenFns) {
      u();
    }
    this.unlistenFns = [];
    if (this.card) {
      this.renderer.removeChild(this.doc.body, this.card);
      this.card = null;
    }
    if (host.getAttribute('aria-describedby') === this.cardId) {
      this.renderer.removeAttribute(host, 'aria-describedby');
    }
    this.doc.defaultView?.removeEventListener('scroll', this.onScroll, true);
  }
}
