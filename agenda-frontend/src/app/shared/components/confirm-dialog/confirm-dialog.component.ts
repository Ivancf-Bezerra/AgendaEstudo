import { DOCUMENT } from '@angular/common';
import {
  Component,
  HostListener,
  effect,
  inject,
} from '@angular/core';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly dialogo = inject(ConfirmDialogService);
  private readonly doc = inject(DOCUMENT);

  constructor() {
    effect((onCleanup) => {
      if (this.dialogo.aberto()) {
        this.doc.body.style.overflow = 'hidden';
      } else {
        this.doc.body.style.overflow = '';
      }
      onCleanup(() => {
        this.doc.body.style.overflow = '';
      });
    });
  }

  @HostListener('document:keydown.escape')
  aoPressionarEscape(): void {
    if (this.dialogo.aberto()) {
      this.dialogo.cancelar();
    }
  }
}
