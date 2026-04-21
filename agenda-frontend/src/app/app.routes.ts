import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/calendar/calendar.page').then((m) => m.CalendarPage),
      },
      {
        path: 'event/new',
        loadComponent: () => import('./features/events/event-form.page').then((m) => m.EventFormPage),
      },
      {
        path: 'event/:id/edit',
        loadComponent: () => import('./features/events/event-form.page').then((m) => m.EventFormPage),
      },
      {
        path: 'notes',
        loadComponent: () => import('./features/notes/notes-list.page').then((m) => m.NotesListPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
