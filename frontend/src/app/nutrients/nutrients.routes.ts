import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./nutrients.component').then((m) => m.NutrientsComponent),
  },
];
