import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'plan',
    loadChildren: () => import('./plan/plan.routes').then((m) => m.routes),
  },
  {
    path: 'library',
    loadChildren: () => import('./library/library.routes').then((m) => m.routes),
  },
  {
    path: 'nutrients',
    loadChildren: () => import('./nutrients/nutrients.routes').then((m) => m.routes),
  },
  {
    path: 'shopping',
    loadChildren: () => import('./shopping/shopping.routes').then((m) => m.routes),
  },
  { path: '', redirectTo: '/plan', pathMatch: 'full' },
  { path: '**', redirectTo: '/plan' },
];
