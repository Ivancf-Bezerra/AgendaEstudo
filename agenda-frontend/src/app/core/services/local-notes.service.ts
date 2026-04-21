import { Injectable, computed, inject, signal } from '@angular/core';
import type { CreateNoteInput, NoteModel } from '../../shared/models/note.model';
import { addDays, startOfDay, toDateKey } from '../../shared/utils/date.utils';
import { ToastService } from './toast.service';

const STORAGE_KEY = 'agenda.notes.v1';

@Injectable({ providedIn: 'root' })
export class LocalNotesService {
  private readonly toast = inject(ToastService);
  private ultimoAvisoPersistenciaMs = 0;
  private readonly notes = signal<NoteModel[]>(this.readAll());

  readonly all = this.notes.asReadonly();

  readonly countByDayKey = computed(() => {
    const map = new Map<string, number>();
    for (const n of this.notes()) {
      map.set(n.dayKey, (map.get(n.dayKey) ?? 0) + 1);
    }
    return map;
  });

  create(input: CreateNoteInput): NoteModel {
    const created = input.createdAt ? new Date(input.createdAt) : new Date();
    const dayKey = toDateKey(startOfDay(created));
    const note: NoteModel = {
      id: crypto.randomUUID(),
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
      dayKey,
      bodyHtml: input.bodyHtml.trim(),
    };
    this.notes.update((list) => [...list, note].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    this.persist();
    return note;
  }

  update(id: string, bodyHtml: string): void {
    const t = bodyHtml.trim();
    const now = new Date().toISOString();
    this.notes.update((list) => {
      const ix = list.findIndex((n) => n.id === id);
      if (ix < 0) {
        return list;
      }
      const prev = list[ix]!;
      const copy = [...list];
      copy[ix] = { ...prev, bodyHtml: t, updatedAt: now };
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    this.persist();
  }

  delete(id: string): void {
    this.notes.update((list) => list.filter((n) => n.id !== id));
    this.persist();
  }

  getById(id: string): NoteModel | undefined {
    return this.notes().find((n) => n.id === id);
  }

  private readAll(): NoteModel[] {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      /** Primeira execução: sem chave → exemplos. `[]` guardado = utilizador apagou tudo, não re-semear. */
      if (raw === null || raw === undefined) {
        return this.seedSamples();
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((x) => this.normalizeNote(x))
        .filter((x): x is NoteModel => x !== null);
    } catch {
      return [];
    }
  }

  private normalizeNote(x: unknown): NoteModel | null {
    if (!x || typeof x !== 'object') {
      return null;
    }
    const o = x as Record<string, unknown>;
    const id = typeof o['id'] === 'string' ? o['id'] : '';
    const createdAt = typeof o['createdAt'] === 'string' ? o['createdAt'] : '';
    const bodyHtml = typeof o['bodyHtml'] === 'string' ? o['bodyHtml'] : '';
    if (!id || !createdAt) {
      return null;
    }
    const c = new Date(createdAt);
    const dayKey =
      typeof o['dayKey'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o['dayKey'])
        ? o['dayKey']
        : toDateKey(startOfDay(c));
    return {
      id,
      createdAt,
      updatedAt: typeof o['updatedAt'] === 'string' ? o['updatedAt'] : createdAt,
      dayKey,
      bodyHtml,
    };
  }

  private persist(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.notes()));
    } catch {
      const agora = Date.now();
      if (agora - this.ultimoAvisoPersistenciaMs < 8000) {
        return;
      }
      this.ultimoAvisoPersistenciaMs = agora;
      this.toast.error(
        'Não conseguimos guardar as notas. Verifica o espaço em disco ou o modo privado do navegador.',
      );
    }
  }

  /** Notas de exemplo (vários meses) quando não há dados. */
  private seedSamples(): NoteModel[] {
    const base = startOfDay(new Date());
    const at = (dayOff: number, h: number, m: number, body: string): NoteModel => {
      const d = addDays(base, dayOff);
      d.setHours(h, m, 0, 0);
      const createdAt = d.toISOString();
      return {
        id: crypto.randomUUID(),
        createdAt,
        updatedAt: createdAt,
        dayKey: toDateKey(startOfDay(d)),
        bodyHtml: body,
      };
    };
    const list: NoteModel[] = [
      at(0, 8, 40, '<p><b>Lembrete</b>: revisar a agenda de hoje.</p>'),
      at(-2, 14, 5, '<p>Lista rápida:</p><ul><li>Água</li><li>Fruta</li></ul>'),
      at(-12, 11, 30, '<p>Idea para o projeto — <i>anotar requisitos</i> antes da reunião.</p>'),
      at(-45, 9, 0, '<p>Nota do mês anterior: <b>metas</b> e hábitos a acompanhar.</p>'),
    ];
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
    return list;
  }
}
