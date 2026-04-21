import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly itemsSignal = signal<ToastItem[]>([]);
  readonly items = this.itemsSignal.asReadonly();

  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  show(message: string, variant: ToastVariant = 'info', durationMs = 3400): void {
    const id = crypto.randomUUID();
    this.itemsSignal.update((list) => [...list, { id, message, variant }]);
    const t = setTimeout(() => this.dismiss(id), durationMs);
    this.timers.set(id, t);
  }

  success(message: string, durationMs?: number): void {
    this.show(message, 'success', durationMs);
  }

  info(message: string, durationMs?: number): void {
    this.show(message, 'info', durationMs);
  }

  error(message: string, durationMs?: number): void {
    this.show(message, 'error', durationMs ?? 5200);
  }

  dismiss(id: string): void {
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
    this.itemsSignal.update((list) => list.filter((x) => x.id !== id));
  }
}
