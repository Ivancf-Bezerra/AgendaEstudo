import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LogIn, LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [LucideAngularModule, TooltipDirective],
  template: `
    <main class="page">
      <div class="card">
        <h1 class="title">Agenda</h1>
        <p class="subtitle">Só neste aparelho. Sem conta.</p>
        <button
          type="button"
          class="btn btn-primary btn-enter"
          appTooltip="Entrar na agenda neste aparelho"
          tooltipPosition="top"
          (click)="enter()"
        >
          <lucide-icon [img]="iconLogIn" [size]="18" strokeWidth="2.25" class="btn-enter__ic" aria-hidden="true" />
          <span>Entrar</span>
        </button>
      </div>
    </main>
  `,
  styles: [
    `
      .page {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 1.25rem;
        background: transparent;
      }
      .card {
        width: min(100%, 22rem);
        padding: 1.5rem 1.5rem 1.5rem 1.35rem;
        box-shadow:
          var(--shadow),
          inset 3px 0 0 0 var(--margin-line);
      }
      .title {
        margin: 0 0 0.5rem;
        font-size: clamp(1.35rem, 4vw, 1.55rem);
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--text);
      }
      .subtitle {
        margin: 0 0 1.25rem;
        color: var(--muted);
        font-size: 0.95rem;
        line-height: 1.45;
      }
      .btn-enter {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        width: 100%;
      }
      .btn-enter__ic {
        display: block;
        flex-shrink: 0;
      }
    `,
  ],
})
export class LoginPage {
  readonly iconLogIn = LogIn;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  constructor() {
    if (this.auth.authenticated()) {
      void this.router.navigateByUrl('/');
    }
  }

  enter(): void {
    this.auth.login();
    this.toast.success('Entraste.', 2200);
    void this.router.navigateByUrl('/');
  }
}
