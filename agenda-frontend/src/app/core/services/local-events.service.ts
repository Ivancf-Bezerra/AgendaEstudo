import { Injectable, computed, inject, signal } from '@angular/core';
import type { CreateEventInput, EventModel } from '../../shared/models/event.model';
import { eventStartDate, toDateKey } from '../../shared/utils/date.utils';
import { ToastService } from './toast.service';

const STORAGE_KEY = 'agenda.events.v1';

@Injectable({ providedIn: 'root' })
export class LocalEventsService {
  private readonly toast = inject(ToastService);
  private ultimoAvisoPersistenciaMs = 0;
  private readonly events = signal<EventModel[]>(this.readAll());

  readonly all = this.events.asReadonly();

  constructor() {
    this.ensureNationalHolidays();
  }

  readonly countByDayKey = computed(() => {
    const map = new Map<string, number>();
    for (const e of this.events()) {
      const k = toDateKey(eventStartDate(e));
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  });

  create(input: CreateEventInput): EventModel {
    const tags = input.tags?.length ? input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 5) : [];
    const event: EventModel = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || undefined,
      description: input.description?.trim() || undefined,
      tags: tags.length ? tags : undefined,
      colorKey: input.colorKey || 'default',
      startDate: input.startDate,
      endDate: input.endDate,
      completed: input.completed ?? false,
    };
    this.events.update((list) => [...list, event].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    this.persist();
    return event;
  }

  update(id: string, input: CreateEventInput): void {
    const tags = input.tags?.length ? input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 5) : [];
    this.events.update((list) => {
      const ix = list.findIndex((e) => e.id === id);
      if (ix < 0) {
        return list;
      }
      const prev = list[ix]!;
      const next: EventModel = {
        ...prev,
        title: input.title.trim(),
        subtitle: input.subtitle?.trim() || undefined,
        description: input.description?.trim() || undefined,
        tags: tags.length ? tags : undefined,
        colorKey: input.colorKey || 'default',
        startDate: input.startDate,
        endDate: input.endDate ?? prev.endDate,
        completed: input.completed ?? prev.completed,
      };
      const copy = [...list];
      copy[ix] = next;
      return copy.sort((a, b) => a.startDate.localeCompare(b.startDate));
    });
    this.persist();
  }

  delete(id: string): void {
    this.events.update((list) => list.filter((e) => e.id !== id));
    this.persist();
  }

  toggleCompleted(id: string): void {
    this.events.update((list) =>
      list.map((e) => (e.id === id ? { ...e, completed: !e.completed } : e)),
    );
    this.persist();
  }

  /** Garante campos novos e `endDate` para dados antigos. */
  private normalizeEvent(e: EventModel): EventModel {
    const tags = Array.isArray(e.tags)
      ? e.tags
          .filter((t) => typeof t === 'string' && t.trim())
          .map((t) => t.trim())
          .slice(0, 5)
      : [];
    let endDate = e.endDate;
    if (!endDate && e.startDate) {
      const s = new Date(e.startDate);
      if (!Number.isNaN(s.getTime())) {
        const end = new Date(s);
        end.setHours(end.getHours() + 1);
        endDate = end.toISOString();
      }
    }
    return {
      ...e,
      subtitle: e.subtitle?.trim() || undefined,
      tags: tags.length ? tags : undefined,
      colorKey: e.colorKey || 'default',
      endDate,
    };
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events()));
    } catch {
      const agora = Date.now();
      if (agora - this.ultimoAvisoPersistenciaMs < 8000) {
        return;
      }
      this.ultimoAvisoPersistenciaMs = agora;
      this.toast.error(
        'Não conseguimos guardar os eventos. Verifica o espaço em disco ou o modo privado do navegador.',
      );
    }
  }

  private readAll(): EventModel[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((x) => x && typeof x === 'object')
        .map((x) => x as EventModel)
        .filter((e) => typeof e.id === 'string' && typeof e.title === 'string' && typeof e.startDate === 'string')
        .map((e) => this.normalizeEvent({ ...e, completed: Boolean(e.completed) }));
    } catch {
      return [];
    }
  }

  private ensureNationalHolidays(): void {
    const years = this.collectRelevantYears(this.events());
    const existingIds = new Set(this.events().map((e) => e.id));
    const toAdd: EventModel[] = [];
    for (const y of years) {
      for (const h of this.buildBrazilNationalHolidays(y)) {
        if (!existingIds.has(h.id)) {
          existingIds.add(h.id);
          toAdd.push(h);
        }
      }
    }
    if (!toAdd.length) {
      return;
    }
    this.events.update((list) => [...list, ...toAdd].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    this.persist();
  }

  private collectRelevantYears(events: EventModel[]): number[] {
    const ys = new Set<number>();
    const now = new Date();
    ys.add(now.getFullYear() - 1);
    ys.add(now.getFullYear());
    ys.add(now.getFullYear() + 1);
    for (const e of events) {
      const s = new Date(e.startDate);
      if (!Number.isNaN(s.getTime())) {
        ys.add(s.getFullYear());
      }
      if (e.endDate) {
        const end = new Date(e.endDate);
        if (!Number.isNaN(end.getTime())) {
          ys.add(end.getFullYear());
        }
      }
    }
    return [...ys].sort((a, b) => a - b);
  }

  private buildBrazilNationalHolidays(year: number): EventModel[] {
    const easter = this.easterSunday(year);
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    const fixed: Array<{ month: number; day: number; title: string }> = [
      { month: 1, day: 1, title: 'Confraternização Universal' },
      { month: 4, day: 21, title: 'Tiradentes' },
      { month: 5, day: 1, title: 'Dia do Trabalhador' },
      { month: 9, day: 7, title: 'Independência do Brasil' },
      { month: 10, day: 12, title: 'Nossa Senhora Aparecida' },
      { month: 11, day: 2, title: 'Finados' },
      { month: 11, day: 15, title: 'Proclamação da República' },
      { month: 11, day: 20, title: 'Dia da Consciência Negra' },
      { month: 12, day: 25, title: 'Natal' },
    ];
    const list: EventModel[] = [
      this.makeHolidayEvent(year, goodFriday.getMonth() + 1, goodFriday.getDate(), 'Sexta-feira Santa'),
    ];
    for (const f of fixed) {
      list.push(this.makeHolidayEvent(year, f.month, f.day, f.title));
    }
    return list;
  }

  private makeHolidayEvent(year: number, month: number, day: number, title: string): EventModel {
    const start = new Date(year, month - 1, day, 9, 0, 0, 0);
    const end = new Date(year, month - 1, day, 10, 0, 0, 0);
    const key = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return {
      id: `feriado-br-${year}-${key}`,
      title,
      subtitle: 'Feriado nacional (Brasil)',
      description: 'Incluído automaticamente pelo calendário.',
      tags: ['feriado', 'nacional'],
      colorKey: 'default',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      completed: false,
    };
  }

  /** Algoritmo de Meeus/Jones/Butcher para data da Páscoa (calendário gregoriano). */
  private easterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.trunc(year / 100);
    const c = year % 100;
    const d = Math.trunc(b / 4);
    const e = b % 4;
    const f = Math.trunc((b + 8) / 25);
    const g = Math.trunc((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.trunc(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.trunc((a + 11 * h + 22 * l) / 451);
    const month = Math.trunc((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day, 9, 0, 0, 0);
  }
}
