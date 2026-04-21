import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'agenda.theme.v1';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly dark = signal(this.readInitial());

  constructor() {
    effect(() => {
      const on = this.dark();
      document.documentElement.classList.toggle('dark', on);
      try {
        localStorage.setItem(STORAGE_KEY, on ? 'dark' : 'light');
      } catch {
        /* ignore */
      }
    });
  }

  toggle(): void {
    this.dark.update((v) => !v);
  }

  private readInitial(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark') return true;
      if (stored === 'light') return false;
    } catch {
      /* ignore */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
}
