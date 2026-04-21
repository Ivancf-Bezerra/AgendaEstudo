import { DestroyRef, Injectable, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import type { EventModel } from '../../shared/models/event.model';
import { eventStartDate, formatEventTimeRange } from '../../shared/utils/date.utils';
import { LocalEventsService } from './local-events.service';
import { ToastService } from './toast.service';

const FIRED_KEY = 'agenda.event-reminders.fired.v1';
const DAY_MS = 86_400_000;
const SOON_MS = 15 * 60_000;
/** Janela após cruzar o limiar (1 dia ou 15 min) para disparar uma vez, mesmo com intervalo largo. */
const WINDOW_MS = 120_000;
const TICK_MS = 15_000;

/** Valor = `startDate` do evento (ms) quando o lembrete disparou; muda se o evento for reagendado. */
type FiredMap = Record<string, number>;

@Injectable({ providedIn: 'root' })
export class EventRemindersService {
  private readonly eventsStore = inject(LocalEventsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Permissão do navegador (atualizada após `requestPermission`). */
  readonly notificationPermission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  /** Eventos futuros não concluídos (próximos 14 dias) — badge no sino. */
  readonly upcomingCount = computed(() => {
    const now = Date.now();
    const horizon = now + 14 * DAY_MS;
    return this.eventsStore
      .all()
      .filter((e) => !e.completed && this.startMs(e) > now && this.startMs(e) <= horizon).length;
  });

  constructor() {
    effect(() => {
      this.eventsStore.all();
      queueMicrotask(() => this.tick());
    });

    afterNextRender(() => {
      const id = window.setInterval(() => this.tick(), TICK_MS);
      this.destroyRef.onDestroy(() => window.clearInterval(id));
    });
  }

  /** Pedir permissão de notificações ao utilizador (chamado ao clicar no sino). */
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') {
      this.toast.error('Este navegador não suporta notificações.');
      return 'denied';
    }
    if (Notification.permission === 'granted') {
      this.notificationPermission.set('granted');
      this.toast.info('Notificações já estão ativas. Avisamos 24 h e 15 min antes de cada evento.', 4200);
      return 'granted';
    }
    if (Notification.permission === 'denied') {
      this.notificationPermission.set('denied');
      this.toast.error('As notificações estão bloqueadas. Ativa-as nas definições do navegador para este site.', 6200);
      return 'denied';
    }
    const p = await Notification.requestPermission();
    this.notificationPermission.set(p);
    if (p === 'granted') {
      this.toast.success('Lembretes ativos: 24 horas e 15 minutos antes de cada evento.', 4200);
    } else {
      this.toast.info('Sem permissão, só mostramos avisos dentro da página quando a agenda estiver aberta.', 5000);
    }
    return p;
  }

  private startMs(e: EventModel): number {
    const t = eventStartDate(e).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  private readFired(): FiredMap {
    try {
      const raw = localStorage.getItem(FIRED_KEY);
      if (!raw) return {};
      const o = JSON.parse(raw) as unknown;
      if (!o || typeof o !== 'object') return {};
      return o as FiredMap;
    } catch {
      return {};
    }
  }

  private writeFired(map: FiredMap): void {
    try {
      localStorage.setItem(FIRED_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  private pruneFired(events: EventModel[]): void {
    const map = this.readFired();
    const byId = new Map(events.map((e) => [e.id, e]));
    let changed = false;
    for (const key of Object.keys(map)) {
      const eventId = key.split(':')[0] ?? '';
      const ev = byId.get(eventId);
      const recorded = map[key];
      if (!ev) {
        delete map[key];
        changed = true;
        continue;
      }
      const currentStart = this.startMs(ev);
      if (currentStart <= Date.now()) {
        delete map[key];
        changed = true;
        continue;
      }
      if (typeof recorded === 'number' && recorded !== currentStart) {
        delete map[key];
        changed = true;
      }
    }
    if (changed) {
      this.writeFired(map);
    }
  }

  private isFired(map: FiredMap, ev: EventModel, kind: '24h' | '15m'): boolean {
    const recorded = map[`${ev.id}:${kind}`];
    return typeof recorded === 'number' && recorded === this.startMs(ev);
  }

  private markFired(map: FiredMap, ev: EventModel, kind: '24h' | '15m'): void {
    map[`${ev.id}:${kind}`] = this.startMs(ev);
    this.writeFired(map);
  }

  private tick(): void {
    const list = this.eventsStore.all();
    this.pruneFired(list);
    const map = this.readFired();
    const now = Date.now();
    const canNotify = typeof Notification !== 'undefined' && Notification.permission === 'granted';

    for (const ev of list) {
      if (ev.completed) continue;
      const start = this.startMs(ev);
      if (!start || start <= now) continue;

      const msBefore = start - now;

      /** Janela [24h − 2min, 24h] de tempo restante (não confundir com “≤ 24h” quando já faltam minutos). */
      if (
        msBefore <= DAY_MS &&
        msBefore >= DAY_MS - WINDOW_MS &&
        !this.isFired(map, ev, '24h')
      ) {
        this.fireReminder(ev, '24h', canNotify, map);
      }
      if (
        msBefore <= SOON_MS &&
        msBefore >= SOON_MS - WINDOW_MS &&
        !this.isFired(map, ev, '15m')
      ) {
        this.fireReminder(ev, '15m', canNotify, map);
      }
    }
  }

  private fireReminder(ev: EventModel, kind: '24h' | '15m', canNotify: boolean, map: FiredMap): void {
    const title = kind === '24h' ? 'Evento amanhã' : 'Evento em 15 minutos';
    const when = formatEventTimeRange(ev);
    const body =
      kind === '24h'
        ? `${ev.title} — ${when} (começa em cerca de 24 horas)`
        : `${ev.title} — ${when}`;

    this.markFired(map, ev, kind);

    if (canNotify) {
      try {
        new Notification(title, { body, tag: `agenda-${ev.id}-${kind}`, requireInteraction: false });
      } catch {
        this.toast.info(body, 5200);
      }
    } else {
      this.toast.info(`${title}: ${body}`, 5200);
    }
  }
}
