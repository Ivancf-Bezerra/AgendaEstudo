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

/** Dica contextual (não nativa). Texto vazio desativa o tooltip. Permite mover o rato para o balão. */
@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnDestroy {
  @Input({ alias: 'appTooltip' }) appTooltip = '';
  /** Posição em relação ao elemento: onde o tooltip “gruda”. */
  @Input() tooltipPosition: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);

  private readonly tipId = `app-tip-${crypto.randomUUID()}`;
  private tip: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private tipUnlisten: Array<() => void> = [];
  private readonly onScroll = (): void => this.hideNow();

  ngOnDestroy(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.hideNow();
    this.doc.defaultView?.removeEventListener('scroll', this.onScroll, true);
  }

  @HostListener('mouseenter')
  @HostListener('focusin')
  onShowIntent(): void {
    const text = this.appTooltip?.trim();
    if (!text) {
      return;
    }
    this.clearShowTimer();
    this.clearHideTimer();
    this.showTimer = setTimeout(() => this.show(text), 280);
  }

  @HostListener('mouseleave', ['$event'])
  @HostListener('focusout')
  onHideIntent(ev?: FocusEvent | MouseEvent): void {
    this.clearShowTimer();
    if (ev && 'relatedTarget' in ev) {
      const to = ev.relatedTarget as Node | null;
      if (this.tip && to && this.tip.contains(to)) {
        return;
      }
    }
    this.scheduleHide(120);
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

  private onTipEnter(): void {
    this.clearHideTimer();
  }

  private onTipLeave(ev: MouseEvent): void {
    const to = ev.relatedTarget as Node | null;
    if (this.el.nativeElement.contains(to)) {
      return;
    }
    this.scheduleHide(80);
  }

  private show(text: string): void {
    if (this.tip) {
      return;
    }
    const host = this.el.nativeElement;
    const tip = this.renderer.createElement('div');
    this.renderer.setAttribute(tip, 'role', 'tooltip');
    this.renderer.setAttribute(tip, 'id', this.tipId);
    this.renderer.addClass(tip, 'app-tooltip');
    tip.textContent = text;
    this.renderer.appendChild(this.doc.body, tip);
    this.tip = tip;
    this.tipUnlisten.push(this.renderer.listen(tip, 'mouseenter', () => this.onTipEnter()));
    this.tipUnlisten.push(this.renderer.listen(tip, 'mouseleave', (e: Event) => this.onTipLeave(e as MouseEvent)));
    this.renderer.setAttribute(host, 'aria-describedby', this.tipId);
    this.doc.defaultView?.addEventListener('scroll', this.onScroll, true);
    this.positionTip();
    requestAnimationFrame(() => this.positionTip());
  }

  private positionTip(): void {
    if (!this.tip) {
      return;
    }
    const host = this.el.nativeElement;
    const rect = host.getBoundingClientRect();
    const margin = 8;
    const tipRect = this.tip.getBoundingClientRect();
    let top = 0;
    let left = 0;

    switch (this.tooltipPosition) {
      case 'top':
        top = rect.top - tipRect.height - margin;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - margin;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + margin;
        break;
      case 'bottom':
      default:
        top = rect.bottom + margin;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
    }

    const vw = this.doc.defaultView?.innerWidth ?? 800;
    const vh = this.doc.defaultView?.innerHeight ?? 600;
    const pad = 6;
    left = Math.max(pad, Math.min(left, vw - tipRect.width - pad));
    top = Math.max(pad, Math.min(top, vh - tipRect.height - pad));

    this.renderer.setStyle(this.tip, 'position', 'fixed');
    this.renderer.setStyle(this.tip, 'top', `${top}px`);
    this.renderer.setStyle(this.tip, 'left', `${left}px`);
    this.renderer.setStyle(this.tip, 'z-index', '10000');
  }

  private hideNow(): void {
    this.clearHideTimer();
    const host = this.el.nativeElement;
    for (const u of this.tipUnlisten) {
      u();
    }
    this.tipUnlisten = [];
    if (this.tip) {
      this.renderer.removeChild(this.doc.body, this.tip);
      this.tip = null;
    }
    if (host.getAttribute('aria-describedby') === this.tipId) {
      this.renderer.removeAttribute(host, 'aria-describedby');
    }
    this.doc.defaultView?.removeEventListener('scroll', this.onScroll, true);
  }
}
