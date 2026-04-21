import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { ToastStackComponent } from './shared/components/toast-stack/toast-stack.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastStackComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  constructor() {
    inject(ThemeService);
  }
}
