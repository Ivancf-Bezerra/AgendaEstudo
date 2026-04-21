import { Component, inject } from '@angular/core';
import { CelebrationService } from '../../services/celebration.service';

@Component({
  selector: 'app-celebration-layer',
  standalone: true,
  template: `
    @if (celebration.particles(); as parts) {
      <div class="celebration-root" aria-hidden="true">
        @for (p of parts; track p.id) {
          <span
            class="particle"
            [style.--x]="p.x + '%'"
            [style.--dx]="p.dx"
            [style.--dy]="p.dy"
            [style.--delay]="p.delay"
            [style.--hue]="p.hue"
            [style.--size]="p.size + 'px'"
          ></span>
        }
      </div>
    }
  `,
  styles: [
    `
      .celebration-root {
        position: fixed;
        inset: 0;
        z-index: 9998;
        pointer-events: none;
        display: grid;
        place-items: center;
      }
      .particle {
        position: absolute;
        left: var(--x);
        top: 48%;
        width: var(--size);
        height: var(--size);
        border-radius: 50%;
        background: hsl(var(--hue), 62%, 58%);
        opacity: 0.9;
        box-shadow: 0 0 6px hsla(var(--hue), 55%, 50%, 0.28);
        animation: burst 0.68s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        animation-delay: var(--delay);
      }
      @keyframes burst {
        from {
          transform: translate(-50%, -50%) scale(0.35);
          opacity: 0;
        }
        18% {
          opacity: 0.95;
          transform: translate(-50%, -50%) scale(1);
        }
        to {
          transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.45);
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .particle {
          animation: none;
          opacity: 0;
        }
      }
    `,
  ],
})
export class CelebrationLayerComponent {
  readonly celebration = inject(CelebrationService);
}
