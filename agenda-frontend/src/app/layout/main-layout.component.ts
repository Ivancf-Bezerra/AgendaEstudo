import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { QuickNoteUiService } from '../core/services/quick-note-ui.service';
import { CelebrationLayerComponent } from '../shared/components/celebration-layer/celebration-layer.component';
import { ConfirmDialogComponent } from '../shared/components/confirm-dialog/confirm-dialog.component';
import { QuickNotePadComponent } from '../shared/components/quick-note-pad/quick-note-pad.component';
import { TooltipDirective } from '../shared/directives/tooltip.directive';
import {
  Bell,
  CalendarPlus,
  CirclePlus,
  LogOut,
  LucideAngularModule,
  Moon,
  Settings,
  StickyNote,
  Sun,
} from 'lucide-angular';
import { EventRemindersService } from '../core/services/event-reminders.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CelebrationLayerComponent,
    ConfirmDialogComponent,
    QuickNotePadComponent,
    LucideAngularModule,
    TooltipDirective,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  readonly iconSun = Sun;
  readonly iconMoon = Moon;
  readonly iconLogout = LogOut;
  readonly iconBell = Bell;
  readonly iconSettings = Settings;
  readonly iconCriar = CirclePlus;
  readonly iconCalendarPlus = CalendarPlus;
  readonly iconStickyNote = StickyNote;

  readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly quickNoteUi = inject(QuickNoteUiService);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly reminders = inject(EventRemindersService);

  /** Esconde o + no ecrã de novo evento ou edição. */
  readonly fabVisible = signal(!this.isEventFormUrl(this.router.url));
  /** Menu flutuante do FAB (novo evento / nova nota). */
  readonly menuCriacaoAberto = signal(false);
  /** Menu engrenagem (tema + sair). */
  readonly menuDefinicoesAberto = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.fabVisible.set(!this.isEventFormUrl(this.router.url));
        this.menuCriacaoAberto.set(false);
        this.menuDefinicoesAberto.set(false);
      });
  }

  @HostListener('document:click', ['$event'])
  aoClicarDocumento(ev: MouseEvent): void {
    const alvo = ev.target as Node | null;

    if (this.menuDefinicoesAberto()) {
      const wrap = this.host.nativeElement.querySelector('[data-topbar-definicoes-wrap]');
      if (!wrap || !alvo || !wrap.contains(alvo)) {
        this.menuDefinicoesAberto.set(false);
      }
    }

    if (!this.menuCriacaoAberto()) {
      return;
    }
    if (alvo && this.host.nativeElement.contains(alvo)) {
      return;
    }
    this.menuCriacaoAberto.set(false);
  }

  @HostListener('document:keydown.escape')
  aoEscapeFecharMenu(): void {
    if (this.menuCriacaoAberto()) {
      this.menuCriacaoAberto.set(false);
    }
    if (this.menuDefinicoesAberto()) {
      this.menuDefinicoesAberto.set(false);
    }
  }

  alternarMenuCriacao(ev: MouseEvent): void {
    ev.stopPropagation();
    this.menuDefinicoesAberto.set(false);
    this.menuCriacaoAberto.update((v) => !v);
  }

  alternarMenuDefinicoes(ev: MouseEvent): void {
    ev.stopPropagation();
    this.menuCriacaoAberto.set(false);
    this.menuDefinicoesAberto.update((v) => !v);
  }

  fecharMenuDefinicoes(): void {
    this.menuDefinicoesAberto.set(false);
  }

  async aoClicarNotificacoes(ev: MouseEvent): Promise<void> {
    ev.stopPropagation();
    this.menuCriacaoAberto.set(false);
    await this.reminders.requestNotificationPermission();
  }

  fecharMenuCriacao(): void {
    this.menuCriacaoAberto.set(false);
  }

  irNovoEvento(): void {
    this.fecharMenuCriacao();
    void this.router.navigateByUrl('/event/new');
  }

  abrirNovaNota(): void {
    this.fecharMenuCriacao();
    this.quickNoteUi.openNew();
  }

  private isEventFormUrl(url: string): boolean {
    return url.includes('/event/new') || /\/event\/[^/]+\/edit/.test(url);
  }

  toggleTheme(): void {
    this.theme.toggle();
    this.fecharMenuDefinicoes();
  }

  logout(): void {
    this.fecharMenuDefinicoes();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

}
