import { Injectable, signal } from '@angular/core';

export interface CelebrationParticle {
  id: number;
  x: number;
  dx: string;
  dy: string;
  delay: string;
  hue: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class CelebrationService {
  /** Partículas ativas; `null` = oculto */
  readonly particles = signal<CelebrationParticle[] | null>(null);

  /** Toque leve ao criar ou guardar evento (quase imperceptível, só “vida” na UI). */
  playSpark(): void {
    this.show(this.makeParticles(8));
  }

  private show(list: CelebrationParticle[]): void {
    this.particles.set(list);
    window.setTimeout(() => this.particles.set(null), 720);
  }

  private makeParticles(count: number): CelebrationParticle[] {
    const out: CelebrationParticle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const dist = 36 + Math.random() * 56;
      const dx = `${Math.cos(angle) * dist}px`;
      const dy = `${Math.sin(angle) * dist - 40 * Math.random()}px`;
      const hue = 210 + Math.random() * 35;
      out.push({
        id: i,
        x: 46 + Math.random() * 8,
        dx,
        dy,
        delay: `${Math.random() * 0.08}s`,
        hue,
        size: 3 + Math.random() * 3,
      });
    }
    return out;
  }
}
