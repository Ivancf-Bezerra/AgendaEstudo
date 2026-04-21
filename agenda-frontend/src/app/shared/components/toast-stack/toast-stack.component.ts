import { animate, style, transition, trigger } from '@angular/animations';
import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-stack',
  standalone: true,
  template: `
    <div class="toast-host" aria-live="polite" aria-relevant="additions text">
      @for (t of toasts.items(); track t.id) {
        <div
          class="toast"
          [class.toast--success]="t.variant === 'success'"
          [class.toast--error]="t.variant === 'error'"
          [class.toast--info]="t.variant === 'info'"
          @toastAnim
          role="status"
        >
          <span class="toast__msg">{{ t.message }}</span>
          <button type="button" class="toast__close" (click)="toasts.dismiss(t.id)" aria-label="Fechar notificação">
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-host {
      position: fixed;
      z-index: 9999;
      right: max(0.75rem, env(safe-area-inset-right));
      bottom: max(0.85rem, env(safe-area-inset-bottom));
      left: max(0.75rem, env(safe-area-inset-left));
      display: flex;
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 0.5rem;
      pointer-events: none;
      max-width: 22rem;
      margin-left: auto;
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 0.55rem;
      padding: 0.65rem 0.55rem 0.65rem 0.85rem;
      border-radius: var(--radius-md, 0.95rem);
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      box-shadow: var(--shadow);
      font-size: 0.9rem;
      line-height: 1.35;
      max-width: 100%;
    }

    .toast--success {
      border-color: color-mix(in srgb, var(--success) 42%, var(--border));
      background: color-mix(in srgb, var(--success) 8%, var(--surface-2));
    }

    .toast--error {
      border-color: color-mix(in srgb, #ef4444 45%, var(--border));
      background: color-mix(in srgb, #ef4444 10%, var(--surface-2));
    }

    .toast--info {
      border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
      background: color-mix(in srgb, var(--accent) 7%, var(--surface-2));
    }

    .toast__msg {
      flex: 1;
      min-width: 0;
      padding-top: 0.08rem;
    }

    .toast__close {
      flex-shrink: 0;
      width: 1.75rem;
      height: 1.75rem;
      border: none;
      border-radius: 0.45rem;
      background: transparent;
      color: var(--muted);
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      display: grid;
      place-items: center;
      padding: 0;
    }

    .toast__close:hover {
      color: var(--text);
      background: color-mix(in srgb, var(--surface-3) 55%, transparent);
    }
  `,
  animations: [
    trigger('toastAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(0.75rem) scale(0.98)' }),
        animate('240ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
      transition(':leave', [
        animate('180ms ease-in', style({ opacity: 0, transform: 'translateY(-0.35rem) scale(0.97)' })),
      ]),
    ]),
  ],
})
export class ToastStackComponent {
  readonly toasts = inject(ToastService);
}
