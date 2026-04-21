import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'agenda.auth.v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly authenticated = signal(this.read());

  login(): void {
    localStorage.setItem(STORAGE_KEY, '1');
    this.authenticated.set(true);
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.authenticated.set(false);
  }

  private read(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
