import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { Comment, Post, PostType } from '../../../shared/models';

// ---------------------------------------------------------------------------
// Module Communauté — 4 microservices Laravel derrière l'API Gateway :
//   category-service : GET  /api/categories                         (création : ADMIN)
//   post-service     : GET  /api/posts?category=&type=&search=&page=  · GET /api/posts/{id}
//                      POST /api/posts · DELETE /api/posts/{id} (auteur ou ADMIN)
//   comment-service  : GET  /api/posts/{id}/comments · POST /api/posts/{id}/comments
//                      DELETE /api/comments/{id} (auteur ou ADMIN)
//   report-service   : POST /api/posts/{id}/report · POST /api/comments/{id}/report
//                      GET  /api/admin/reports · PATCH /api/admin/reports/{id} (ADMIN)
// Les « favoris » sont propres à chaque utilisateur et gardés dans le navigateur (pas d'API).
// ---------------------------------------------------------------------------

interface ApiList<T> { data: T[]; meta?: { current_page: number; last_page: number; total: number }; }
interface ApiItem<T> { data: T; }

interface ApiCategory { id: number; name: string; slug: string; description: string | null; }
interface ApiPost {
  id: number; author_id: string; author_name: string | null; category_id: number | null;
  type: 'post' | 'question'; title: string; content: string; status: string;
  images?: string[];
  created_at: string; updated_at: string;
}

export const MAX_POST_PHOTOS = 4;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
interface ApiComment {
  id: number; post_id: number; author_id: string; author_name: string | null;
  content: string; status: string; created_at: string;
}
export interface ApiReport {
  id: number; reporter_id: string; target_type: 'post' | 'comment'; target_id: number;
  reason: string; details: string | null; status: string; created_at: string;
}

export interface CommunityCategory { id: number; slug: string; name: string; description: string; icon: string; }

export interface PostPage { posts: Post[]; hasMore: boolean; total: number; }

/** Icônes par slug de catégorie (catégories créées par un admin : icône par défaut). */
const CATEGORY_ICONS: Record<string, string> = {
  'sante-bebe': 'health_and_safety', alimentation: 'restaurant_menu', sommeil: 'bedtime',
  materiel: 'stroller', 'garde-denfants': 'child_care', activites: 'toys', autre: 'forum',
};

/** Deux types côté API : « question » et « post » (partage, conseil, recommandation). */
export const POST_TYPES: { key: PostType; api: 'question' | 'post'; label: string; icon: string }[] = [
  { key: 'QUESTION', api: 'question', label: 'Question', icon: 'help_outline' },
  { key: 'ADVICE', api: 'post', label: 'Partage & conseil', icon: 'lightbulb' },
];

@Injectable({ providedIn: 'root' })
export class CommunityService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiBaseUrl;

  /** Catégories chargées une seule fois (partagées entre les écrans). */
  private categories$?: Observable<CommunityCategory[]>;

  // ---------------------------------------------------------------- rôles
  get currentUserId(): string | undefined {
    return this.auth.currentUser?.id;
  }

  isAdmin(): boolean {
    const user = this.auth.currentUser;
    return user?.role === 'ADMIN' || (user?.roles ?? []).some(r => r.toUpperCase() === 'ADMIN');
  }

  // ----------------------------------------------------------- catégories
  getCategories(): Observable<CommunityCategory[]> {
    if (!this.categories$) {
      this.categories$ = this.http.get<ApiList<ApiCategory>>(`${this.api}/api/categories`).pipe(
        map(res => res.data.map(c => ({
          id: c.id, slug: c.slug, name: c.name, description: c.description ?? '',
          icon: CATEGORY_ICONS[c.slug] ?? 'label',
        }))),
        shareReplay(1),
      );
      // En cas d'erreur, on autorise un nouvel essai au prochain appel
      this.categories$.subscribe({ error: () => (this.categories$ = undefined) });
    }
    return this.categories$;
  }

  // ---------------------------------------------------------------- posts
  getPosts(categorySlug?: string, type?: string, search?: string, page = 1): Observable<PostPage> {
    return this.getCategories().pipe(
      catchError(() => of([] as CommunityCategory[])),
      switchMap(categories => {
        let params = new HttpParams().set('page', page).set('order', 'desc');
        const category = categories.find(c => c.slug === categorySlug);
        if (category) params = params.set('category', category.id);
        const apiType = POST_TYPES.find(t => t.key === type)?.api;
        if (apiType) params = params.set('type', apiType);
        if (search?.trim()) params = params.set('search', search.trim());

        return this.http.get<ApiList<ApiPost>>(`${this.api}/api/posts`, { params }).pipe(
          switchMap(res => {
            const posts = res.data.map(p => this.toPost(p, categories));
            const counts$ = posts.length
              ? forkJoin(posts.map(p => this.countComments(p.id)))
              : of([] as number[]);
            return counts$.pipe(map(counts => {
              posts.forEach((p, i) => (p.commentCount = counts[i]));
              const meta = res.meta;
              return { posts, hasMore: !!meta && meta.current_page < meta.last_page, total: meta?.total ?? posts.length };
            }));
          }),
        );
      }),
    );
  }

  getPostById(id: string): Observable<Post | undefined> {
    return forkJoin({
      post: this.http.get<ApiItem<ApiPost>>(`${this.api}/api/posts/${id}`),
      categories: this.getCategories().pipe(catchError(() => of([] as CommunityCategory[]))),
    }).pipe(
      map(({ post, categories }) => this.toPost(post.data, categories)),
      catchError((err: HttpErrorResponse) => (err.status === 404 ? of(undefined) : throwError(() => err))),
    );
  }

  createPost(data: { title: string; content: string; type: PostType; category: string; images?: string[] }): Observable<Post> {
    return this.getCategories().pipe(
      switchMap(categories => {
        const category = categories.find(c => c.slug === data.category) ?? categories[0];
        const body = {
          category_id: category?.id,
          type: POST_TYPES.find(t => t.key === data.type)?.api ?? 'post',
          title: data.title.trim(),
          content: data.content.trim(),
          images: (data.images ?? []).map(u => this.toStoredUrl(u)),
        };
        return this.http.post<ApiItem<ApiPost>>(`${this.api}/api/posts`, body).pipe(
          map(res => this.toPost(res.data, categories)),
        );
      }),
    );
  }

  /** Modification par l'auteur (titre, contenu, type, catégorie, photos). */
  updatePost(id: string, data: { title: string; content: string; type: PostType; category: string; images: string[] }): Observable<Post> {
    return this.getCategories().pipe(
      switchMap(categories => {
        const category = categories.find(c => c.slug === data.category);
        const body = {
          category_id: category?.id,
          type: POST_TYPES.find(t => t.key === data.type)?.api ?? 'post',
          title: data.title.trim(),
          content: data.content.trim(),
          images: data.images.map(u => this.toStoredUrl(u)),
        };
        return this.http.put<ApiItem<ApiPost>>(`${this.api}/api/posts/${id}`, body).pipe(
          map(res => this.toPost(res.data, categories)),
        );
      }),
    );
  }

  // ---------------------------------------------------------- photos
  validatePhoto(file: File): string | null {
    if (!PHOTO_TYPES.includes(file.type)) return `« ${file.name} » : formats acceptés JPEG, PNG, WebP ou GIF.`;
    if (file.size > 5 * 1024 * 1024) return `« ${file.name} » dépasse 5 Mo.`;
    return null;
  }

  /** POST /api/posts/images (multipart files[]) : URL affichables des photos enregistrées. */
  uploadPhotos(files: File[]): Observable<string[]> {
    const form = new FormData();
    files.forEach(f => form.append('files[]', f, f.name));
    return this.http.post<{ urls: string[] }>(`${this.api}/api/posts/images`, form, { headers: { Accept: 'application/json' } })
      .pipe(map(res => res.urls.map(u => this.toDisplayUrl(u))));
  }

  private toDisplayUrl(url: string): string {
    return url.startsWith('/api/') ? `${this.api}${url}` : url;
  }

  private toStoredUrl(url: string): string {
    return url.startsWith(`${this.api}/api/`) ? url.substring(this.api.length) : url;
  }

  deletePost(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/api/posts/${id}`);
  }

  // ---------------------------------------------------------- commentaires
  getCommentsByPostId(postId: string): Observable<Comment[]> {
    return this.http.get<ApiList<ApiComment>>(`${this.api}/api/posts/${postId}/comments`).pipe(
      map(res => res.data
        .map(c => this.toComment(c))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
    );
  }

  addComment(postId: string, content: string): Observable<Comment> {
    return this.http.post<ApiItem<ApiComment>>(`${this.api}/api/posts/${postId}/comments`, { content: content.trim() })
      .pipe(map(res => this.toComment(res.data)));
  }

  updateComment(commentId: string, content: string): Observable<Comment> {
    return this.http.put<ApiItem<ApiComment>>(`${this.api}/api/comments/${commentId}`, { content: content.trim() },
      { headers: { Accept: 'application/json' } }).pipe(map(res => this.toComment(res.data)));
  }

  deleteComment(commentId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/api/comments/${commentId}`);
  }

  private countComments(postId: string): Observable<number> {
    return this.http.get<ApiList<ApiComment>>(`${this.api}/api/posts/${postId}/comments`).pipe(
      map(res => res.data.length),
      catchError(() => of(0)),
    );
  }

  // ---------------------------------------------------------- signalements
  reportPost(id: string, reason: string, details?: string): Observable<void> {
    return this.http.post(`${this.api}/api/posts/${id}/report`, { reason, details: details || null }).pipe(
      map(() => this.remember('reported', id, true)),
    );
  }

  reportComment(id: string, reason: string): Observable<void> {
    return this.http.post(`${this.api}/api/comments/${id}/report`, { reason }).pipe(map(() => undefined));
  }

  /** Signalements en attente (ADMIN). */
  getPendingReports(): Observable<ApiReport[]> {
    return this.http.get<ApiList<ApiReport>>(`${this.api}/api/admin/reports`).pipe(map(res => res.data));
  }

  /** Traite un signalement : « hide_content » (contenu retiré) ou « reject » (signalement rejeté). */
  reviewReport(id: number, action: 'hide_content' | 'reject', notes?: string): Observable<void> {
    return this.http.patch(`${this.api}/api/admin/reports/${id}`, { action, notes: notes || null }).pipe(map(() => undefined));
  }

  // -------------------------------------------------- favoris (navigateur)
  toggleSavePost(id: string): Observable<boolean> {
    const saved = !this.isRemembered('saved', id);
    this.remember('saved', id, saved);
    return of(saved);
  }

  // ------------------------------------------------------------ utilitaires
  errorMessage(err: unknown, fallback: string): string {
    const http = err as HttpErrorResponse;
    const body = http?.error;
    if (body?.errors && typeof body.errors === 'object') {
      const first = Object.values(body.errors as Record<string, string[]>)[0];
      if (Array.isArray(first) && first.length) return first[0];
    }
    if (typeof body?.message === 'string' && body.message.trim()) return body.message;
    if (http?.status === 0) return 'Service indisponible. Vérifiez que la plateforme est démarrée.';
    if (http?.status === 429) return 'Trop de requêtes, réessayez dans une minute.';
    return fallback;
  }

  private toPost(p: ApiPost, categories: CommunityCategory[]): Post {
    const category = categories.find(c => c.id === p.category_id);
    const id = String(p.id);
    return {
      id,
      authorId: p.author_id,
      authorName: p.author_name || 'Parent',
      type: p.type === 'question' ? 'QUESTION' : 'ADVICE',
      category: category?.slug ?? 'autre',
      categoryId: p.category_id,
      categoryName: category?.name ?? 'Autre',
      title: p.title,
      content: p.content,
      tags: [],
      images: (p.images ?? []).map(u => this.toDisplayUrl(u)),
      commentCount: 0,
      likeCount: 0,
      isSaved: this.isRemembered('saved', id),
      isReported: this.isRemembered('reported', id),
      isMine: !!this.currentUserId && p.author_id === this.currentUserId,
      createdAt: new Date(p.created_at),
      updatedAt: new Date(p.updated_at),
    };
  }

  private toComment(c: ApiComment): Comment {
    return {
      id: String(c.id),
      postId: String(c.post_id),
      authorId: c.author_id,
      authorName: c.author_name || 'Parent',
      content: c.content,
      likeCount: 0,
      createdAt: new Date(c.created_at),
      isMine: !!this.currentUserId && c.author_id === this.currentUserId,
    };
  }

  // Listes par utilisateur dans le navigateur (favoris, publications déjà signalées)
  private storageKey(kind: string): string {
    return `pc_community_${kind}_${this.currentUserId ?? 'anonyme'}`;
  }

  private readIds(kind: string): string[] {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey(kind)) || '[]');
    } catch {
      return [];
    }
  }

  private isRemembered(kind: string, id: string): boolean {
    return this.readIds(kind).includes(id);
  }

  private remember(kind: string, id: string, on: boolean): void {
    const ids = new Set(this.readIds(kind));
    on ? ids.add(id) : ids.delete(id);
    try {
      localStorage.setItem(this.storageKey(kind), JSON.stringify([...ids]));
    } catch {
      // stockage indisponible (navigation privée) : sans conséquence
    }
  }
}
