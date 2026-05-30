import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./library.component').then((m) => m.LibraryComponent),
  },
];
