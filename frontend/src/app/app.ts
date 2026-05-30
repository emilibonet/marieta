import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavItem {
  label: string;
  route: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly navItems: NavItem[] = [
    { label: 'plan', route: '/plan' },
    { label: 'library', route: '/library' },
    { label: 'nutrients', route: '/nutrients' },
    { label: 'shopping', route: '/shopping' },
  ];
}
