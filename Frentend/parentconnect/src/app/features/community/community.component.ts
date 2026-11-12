import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { ApiReport, CommunityCategory, CommunityService, POST_TYPES, PostPage } from './services/community.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Post, User } from '../../shared/models';

interface FilterTab {
  key: string;
  label: string;
  icon: string;
}

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-community',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './community.component.html',
  styleUrls: ['./community.component.scss']
})
export class CommunityComponent implements OnInit, OnDestroy {
  posts: Post[] = [];
  isLoading = true;
  isLoadingMore = false;
  loadError = false;
  hasMore = false;
  totalPosts = 0;
  page = 1;
  selectedCategory = 'ALL';
  selectedType = 'ALL';
  searchQuery = '';
  onlySaved = false;
  currentUser: User | null = null;
  isAdmin = false;

  categories: FilterTab[] = [{ key: 'ALL', label: 'Toutes', icon: 'bubble_chart' }];
  communityCategories: CommunityCategory[] = [];

  typeFilters: FilterTab[] = [
    { key: 'ALL', label: 'Tous les échanges', icon: 'forum' },
    ...POST_TYPES.map(t => ({ key: t.key, label: t.label, icon: t.icon })),
  ];

  /** Modération (ADMIN) */
  reports: ApiReport[] = [];
  isLoadingReports = false;

  private readonly reload$ = new Subject<void>();
  private readonly search$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  constructor(
    private communityService: CommunityService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      this.isAdmin = this.communityService.isAdmin();
    }));

    this.communityService.getCategories().subscribe({
      next: cats => {
        this.communityCategories = cats;
        this.categories = [{ key: 'ALL', label: 'Toutes', icon: 'bubble_chart' },
          ...cats.map(c => ({ key: c.slug, label: c.name, icon: c.icon }))];
      },
      error: () => this.toastService.error('Catégories indisponibles.')
    });

    this.subscriptions.add(this.reload$.pipe(
      tap(() => { this.isLoading = true; this.loadError = false; this.page = 1; }),
      switchMap(() => this.communityService
        .getPosts(this.selectedCategory, this.selectedType, this.searchQuery, 1)
        .pipe(catchError(err => {
          this.loadError = true;
          this.toastService.error(this.communityService.errorMessage(err, 'Impossible de charger les publications.'));
          return of<PostPage>({ posts: [], hasMore: false, total: 0 });
        })))
    ).subscribe(page => {
      this.posts = page.posts;
      this.hasMore = page.hasMore;
      this.totalPosts = page.total;
      this.isLoading = false;
    }));

    this.subscriptions.add(this.search$.pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => this.loadPosts()));

    this.loadPosts();
    if (this.isAdmin) this.loadReports();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get visiblePosts(): Post[] {
    return this.onlySaved ? this.posts.filter(p => p.isSaved) : this.posts;
  }

  /** Nombre de publications chargées par catégorie (encart « Catégories actives »). */
  get activeCategories(): { slug: string; name: string; count: number }[] {
    const counts = new Map<string, { slug: string; name: string; count: number }>();
    for (const p of this.posts) {
      const entry = counts.get(p.category) ?? { slug: p.category, name: p.categoryName ?? p.category, count: 0 };
      entry.count++;
      counts.set(p.category, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }

  get questionCount(): number {
    return this.posts.filter(p => p.type === 'QUESTION').length;
  }

  loadPosts(): void {
    this.reload$.next();
  }

  loadMore(): void {
    if (!this.hasMore || this.isLoadingMore) return;
    this.isLoadingMore = true;
    this.communityService.getPosts(this.selectedCategory, this.selectedType, this.searchQuery, this.page + 1).subscribe({
      next: page => {
        this.page++;
        this.posts = [...this.posts, ...page.posts];
        this.hasMore = page.hasMore;
        this.isLoadingMore = false;
      },
      error: err => {
        this.isLoadingMore = false;
        this.toastService.error(this.communityService.errorMessage(err, 'Impossible de charger la suite.'));
      }
    });
  }

  selectCategory(categoryKey: string): void {
    this.selectedCategory = categoryKey;
    this.loadPosts();
  }

  selectType(typeKey: string): void {
    this.selectedType = typeKey;
    this.loadPosts();
  }

  toggleOnlySaved(): void {
    this.onlySaved = !this.onlySaved;
  }

  onSearch(): void {
    this.search$.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.search$.next('');
  }

  /** Clic sur un mot-clé : recherche de ce mot. */
  selectTopic(tag: string): void {
    this.searchQuery = tag.replace('#', '');
    this.search$.next(this.searchQuery);
  }

  toggleSave(event: Event, post: Post): void {
    event.stopPropagation();
    event.preventDefault();
    this.communityService.toggleSavePost(post.id).subscribe(isSaved => {
      post.isSaved = isSaved;
      this.toastService.success(isSaved ? 'Enregistré dans vos favoris !' : 'Retiré de vos favoris.');
    });
  }

  sharePost(event: Event, post: Post): void {
    event.stopPropagation();
    event.preventDefault();

    const shareUrl = `${window.location.origin}/app/community/${post.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        this.toastService.info('Lien de la publication copié dans le presse-papier !');
      });
    } else {
      this.toastService.info(`Lien : ${shareUrl}`);
    }
  }

  reportPost(event: Event, post: Post): void {
    event.stopPropagation();
    event.preventDefault();
    const reason = window.prompt('Pourquoi signalez-vous cette publication ? (3 caractères minimum)', 'Contenu inapproprié');
    if (!reason || reason.trim().length < 3) return;
    this.communityService.reportPost(post.id, reason.trim()).subscribe({
      next: () => {
        post.isReported = true;
        this.toastService.warning('Publication signalée à l\'équipe de modération.');
      },
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Signalement impossible.'))
    });
  }

  deletePost(event: Event, post: Post): void {
    event.stopPropagation();
    event.preventDefault();
    if (!window.confirm(`Supprimer « ${post.title} » ?`)) return;
    this.communityService.deletePost(post.id).subscribe({
      next: () => {
        this.posts = this.posts.filter(p => p.id !== post.id);
        this.totalPosts = Math.max(0, this.totalPosts - 1);
        this.toastService.success('Publication supprimée.');
      },
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Suppression impossible.'))
    });
  }

  // ---------------------------------------------------------- modération
  loadReports(): void {
    this.isLoadingReports = true;
    this.communityService.getPendingReports().subscribe({
      next: reports => {
        this.reports = reports;
        this.isLoadingReports = false;
      },
      error: () => {
        this.reports = [];
        this.isLoadingReports = false;
      }
    });
  }

  /** Retire le contenu signalé (suppression de la publication / du commentaire) puis clôt le signalement. */
  hideReported(report: ApiReport): void {
    if (!window.confirm('Retirer ce contenu de la communauté ?')) return;
    const removal$ = report.target_type === 'post'
      ? this.communityService.deletePost(String(report.target_id))
      : this.communityService.deleteComment(String(report.target_id));
    removal$.pipe(
      catchError(() => of(undefined)), // contenu déjà supprimé : on clôt quand même le signalement
      switchMap(() => this.communityService.reviewReport(report.id, 'hide_content'))
    ).subscribe({
      next: () => {
        this.reports = this.reports.filter(r => r.id !== report.id);
        if (report.target_type === 'post') this.posts = this.posts.filter(p => p.id !== String(report.target_id));
        this.toastService.success('Contenu retiré et signalement traité.');
      },
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Traitement impossible.'))
    });
  }

  rejectReport(report: ApiReport): void {
    this.communityService.reviewReport(report.id, 'reject').subscribe({
      next: () => {
        this.reports = this.reports.filter(r => r.id !== report.id);
        this.toastService.info('Signalement rejeté : le contenu reste visible.');
      },
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Traitement impossible.'))
    });
  }

  // ---------------------------------------------------------- affichage
  getCategoryLabel(category: string): string {
    return this.communityCategories.find(c => c.slug === category)?.name ?? category;
  }

  getTypeLabel(type: string): string {
    return type === 'QUESTION' ? 'Question' : 'Partage & conseil';
  }

  getTypeBadgeClass(type: string): string {
    return type === 'QUESTION' ? 'badge-question' : 'badge-advice';
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  getUserInitials(): string {
    if (!this.currentUser) return 'M';
    return ((this.currentUser.firstName?.[0] ?? '') + (this.currentUser.lastName?.[0] ?? '')).toUpperCase() || 'M';
  }

  trackById(_: number, post: Post): string {
    return post.id;
  }
}
