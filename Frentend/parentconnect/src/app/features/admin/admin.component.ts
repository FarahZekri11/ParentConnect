import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { AdminService, AdminStats, AdminUser } from './admin.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

type Tab = 'dashboard' | 'users' | 'moderation';

interface Kpi { label: string; value: string; icon: string; tone: string; hint?: string; }
interface Bar { label: string; value: number; tone: string; }

/** Tableau de bord administrateur : statistiques réelles, gestion des comptes, modération des modules. */
@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels HTTP.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  tab: Tab = 'dashboard';

  // ----- statistiques
  stats: AdminStats | null = null;
  loadingStats = true;
  statsError = false;
  kpis: Kpi[] = [];
  activityBars: Bar[] = [];
  registrations: { date: string; count: number }[] = [];
  maxRegistrations = 1;

  // ----- utilisateurs
  users: AdminUser[] = [];
  totalUsers = 0;
  search = '';
  roleFilter = '';
  page = 0;
  readonly pageSize = 15;
  loadingUsers = false;
  busyUserId: string | null = null;
  editing: { id: string; firstName: string; lastName: string; email: string } | null = null;
  readonly roles = [
    { value: 'PARENT', label: 'Parent' },
    { value: 'BABYSITTER', label: 'Babysitter' },
    { value: 'ADMIN', label: 'Administrateur' },
  ];
  readonly myId: string | undefined;
  private readonly search$ = new Subject<void>();

  constructor(
    private admin: AdminService,
    private toast: ToastService,
    auth: AuthService
  ) {
    this.myId = auth.currentUser?.id;
  }

  ngOnInit(): void {
    this.loadStats();
    this.search$.pipe(debounceTime(300)).subscribe(() => {
      this.page = 0;
      this.loadUsers();
    });
  }

  selectTab(tab: Tab): void {
    this.tab = tab;
    if (tab === 'users' && !this.users.length) this.loadUsers();
  }

  // =============================================================== statistiques
  loadStats(): void {
    this.loadingStats = true;
    this.statsError = false;
    this.admin.stats().subscribe({
      next: s => {
        this.stats = s;
        this.loadingStats = false;
        this.buildDashboard(s);
      },
      error: err => {
        this.loadingStats = false;
        this.statsError = true;
        this.toast.error(this.admin.errorMessage(err, 'Statistiques indisponibles.'));
      }
    });
  }

  /** Valeur d'un compteur de module ; « – » si le module n'a pas répondu (jamais de chiffre inventé). */
  metric(module: string, key: string): string {
    const m = this.stats?.modules?.[module];
    if (!m || !m.available) return '–';
    const v = m[key];
    return typeof v === 'number' ? v.toLocaleString('fr-FR') : '–';
  }

  private num(module: string, key: string): number {
    const m = this.stats?.modules?.[module];
    const v = m?.available ? m[key] : null;
    return typeof v === 'number' ? v : 0;
  }

  moduleAvailable(module: string): boolean {
    return !!this.stats?.modules?.[module]?.available;
  }

  get unavailableModules(): string[] {
    return Object.entries(this.stats?.modules ?? {}).filter(([, m]) => !m.available).map(([k]) => k);
  }

  private buildDashboard(s: AdminStats): void {
    const byRole = s.users.byRole ?? {};
    this.kpis = [
      { label: 'Utilisateurs', value: s.users.total.toLocaleString('fr-FR'), icon: 'group', tone: 'indigo',
        hint: s.users.disabled ? `${s.users.disabled} suspendu(s)` : 'tous actifs' },
      { label: 'Parents', value: String(byRole['PARENT'] ?? 0), icon: 'family_restroom', tone: 'blue' },
      { label: 'Babysitters', value: String(byRole['BABYSITTER'] ?? 0), icon: 'child_care', tone: 'pink' },
      { label: 'Administrateurs', value: String(byRole['ADMIN'] ?? 0), icon: 'admin_panel_settings', tone: 'slate' },
      { label: 'Demandes de garde', value: this.metric('babysitting', 'requests'), icon: 'event_note', tone: 'pink',
        hint: `${this.metric('babysitting', 'bookings')} réservation(s)` },
      { label: 'Annonces', value: this.metric('marketplace', 'listings'), icon: 'storefront', tone: 'green' },
      { label: 'Événements publiés', value: this.metric('events', 'published'), icon: 'celebration', tone: 'amber' },
      { label: 'Participations', value: this.metric('participations', 'confirmed'), icon: 'how_to_reg', tone: 'amber',
        hint: `${this.metric('participations', 'children_registered')} enfant(s) inscrit(s)` },
      { label: 'Publications', value: this.metric('community', 'posts'), icon: 'forum', tone: 'violet',
        hint: `${this.metric('reports', 'pending')} signalement(s) en attente` },
      { label: 'Conversations', value: this.metric('messaging', 'conversations'), icon: 'chat', tone: 'teal',
        hint: `${this.metric('messaging', 'messages')} message(s)` },
    ];
    this.activityBars = [
      { label: 'Gardes (demandes)', value: this.num('babysitting', 'requests'), tone: 'pink' },
      { label: 'Annonces', value: this.num('marketplace', 'listings'), tone: 'green' },
      { label: 'Événements', value: this.num('events', 'published'), tone: 'amber' },
      { label: 'Participations', value: this.num('participations', 'confirmed'), tone: 'orange' },
      { label: 'Publications', value: this.num('community', 'posts'), tone: 'violet' },
      { label: 'Messages', value: this.num('messaging', 'messages'), tone: 'teal' },
      { label: 'Points de rencontre', value: this.num('geo', 'meeting_points'), tone: 'slate' },
    ];
    this.registrations = s.users.registrationsByDay ?? [];
    this.maxRegistrations = Math.max(1, ...this.registrations.map(r => r.count));
  }

  get maxActivity(): number {
    return Math.max(1, ...this.activityBars.map(b => b.value));
  }

  get registrationsTotal(): number {
    return this.registrations.reduce((sum, r) => sum + r.count, 0);
  }

  /** Répartition Parents / Babysitters (anneau en conic-gradient). */
  get split(): { parents: number; sitters: number; parentPct: number; gradient: string } {
    const parents = this.stats?.users.byRole?.['PARENT'] ?? 0;
    const sitters = this.stats?.users.byRole?.['BABYSITTER'] ?? 0;
    const total = parents + sitters;
    const parentPct = total ? Math.round((parents / total) * 100) : 0;
    const gradient = total
      ? `conic-gradient(#4f46e5 0 ${parentPct}%, #ec4899 ${parentPct}% 100%)`
      : 'conic-gradient(#e2e8f0 0 100%)';
    return { parents, sitters, parentPct, gradient };
  }

  barHeight(count: number): number {
    return Math.round((count / this.maxRegistrations) * 100);
  }

  shortDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  formatDate(ts: number | null): string {
    return ts ? new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
  }

  roleLabel(role: string | null): string {
    switch (role) {
      case 'ADMIN': return 'Administrateur';
      case 'BABYSITTER': return 'Babysitter';
      case 'PROFESSIONAL': return 'Professionnel';
      case 'PARENT': return 'Parent';
      default: return 'Sans rôle';
    }
  }

  fullName(u: AdminUser): string {
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username;
  }

  // =============================================================== utilisateurs
  onSearch(): void {
    this.search$.next();
  }

  loadUsers(): void {
    this.loadingUsers = true;
    this.admin.users(this.search, this.roleFilter, this.page * this.pageSize, this.pageSize).subscribe({
      next: page => {
        this.users = page.items;
        this.totalUsers = page.total;
        this.loadingUsers = false;
      },
      error: err => {
        this.loadingUsers = false;
        this.toast.error(this.admin.errorMessage(err, 'Liste des utilisateurs indisponible.'));
      }
    });
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.totalUsers / this.pageSize));
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.pageCount) return;
    this.page = page;
    this.loadUsers();
  }

  startEdit(u: AdminUser): void {
    this.editing = { id: u.id, firstName: u.firstName ?? '', lastName: u.lastName ?? '', email: u.email ?? '' };
  }

  saveEdit(): void {
    const e = this.editing;
    if (!e) return;
    this.busyUserId = e.id;
    this.admin.updateUser(e.id, { firstName: e.firstName, lastName: e.lastName, email: e.email }).subscribe({
      next: () => {
        this.busyUserId = null;
        this.editing = null;
        this.toast.success('Utilisateur modifié.');
        this.loadUsers();
      },
      error: err => {
        this.busyUserId = null;
        this.toast.error(this.admin.errorMessage(err, 'Modification impossible.'));
      }
    });
  }

  toggleEnabled(u: AdminUser): void {
    const enable = !u.enabled;
    if (!enable && !window.confirm(`Suspendre le compte de ${this.fullName(u)} ? Il ne pourra plus se connecter.`)) return;
    this.busyUserId = u.id;
    this.admin.setEnabled(u.id, enable).subscribe({
      next: () => {
        this.busyUserId = null;
        u.enabled = enable;
        this.toast.success(enable ? 'Compte réactivé.' : 'Compte suspendu.');
      },
      error: err => {
        this.busyUserId = null;
        this.toast.error(this.admin.errorMessage(err, 'Action impossible.'));
      }
    });
  }

  changeRole(u: AdminUser, role: string): void {
    if (role === u.role) return;
    if (!window.confirm(`Attribuer le rôle « ${this.roleLabel(role)} » à ${this.fullName(u)} ?`)) {
      this.loadUsers();
      return;
    }
    this.busyUserId = u.id;
    this.admin.setRole(u.id, role).subscribe({
      next: () => {
        this.busyUserId = null;
        this.toast.success('Rôle mis à jour (pris en compte à la prochaine connexion de l\'utilisateur).');
        this.loadUsers();
      },
      error: err => {
        this.busyUserId = null;
        this.toast.error(this.admin.errorMessage(err, 'Changement de rôle impossible.'));
        this.loadUsers();
      }
    });
  }

  deleteUser(u: AdminUser): void {
    if (!window.confirm(`Supprimer définitivement le compte de ${this.fullName(u)} (${u.email ?? u.username}) ?`)) return;
    this.busyUserId = u.id;
    this.admin.deleteUser(u.id).subscribe({
      next: () => {
        this.busyUserId = null;
        this.toast.success('Compte supprimé.');
        this.loadUsers();
      },
      error: err => {
        this.busyUserId = null;
        this.toast.error(this.admin.errorMessage(err, 'Suppression impossible.'));
      }
    });
  }
}
