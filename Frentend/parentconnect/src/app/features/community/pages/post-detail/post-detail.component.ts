import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommunityService } from '../../services/community.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Post, Comment, User } from '../../../../shared/models';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-post-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './post-detail.component.html',
  styleUrls: ['./post-detail.component.scss']
})
export class PostDetailComponent implements OnInit {
  post: Post | null = null;
  comments: Comment[] = [];
  isLoading = true;
  isSubmittingComment = false;
  newCommentText = '';
  currentUser: User | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private communityService: CommunityService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });

    const postId = this.route.snapshot.paramMap.get('id');
    if (postId) {
      this.loadPostData(postId);
    } else {
      this.isLoading = false;
    }
  }

  loadPostData(postId: string): void {
    this.isLoading = true;

    this.communityService.getPostById(postId).subscribe({
      next: foundPost => {
        if (!foundPost) {
          this.isLoading = false;
          this.toastService.error('Publication introuvable.');
          return;
        }

        this.post = foundPost;
        this.communityService.getCommentsByPostId(postId).subscribe({
          next: comments => {
            this.comments = comments;
            if (this.post) this.post.commentCount = comments.length;
            this.isLoading = false;
          },
          error: () => {
            this.isLoading = false;
            this.toastService.warning('Les commentaires sont momentanément indisponibles.');
          }
        });
      },
      error: err => {
        this.isLoading = false;
        this.toastService.error(this.communityService.errorMessage(err, 'Erreur lors du chargement de la publication.'));
      }
    });
  }

  get isAdmin(): boolean {
    return this.communityService.isAdmin();
  }

  toggleSavePost(): void {
    if (!this.post) return;
    this.communityService.toggleSavePost(this.post.id).subscribe(isSaved => {
      if (this.post) this.post.isSaved = isSaved;
      this.toastService.success(isSaved ? 'Ajouté à vos favoris !' : 'Retiré de vos favoris.');
    });
  }

  sharePost(): void {
    const shareUrl = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        this.toastService.info('Lien de la discussion copié !');
      });
    } else {
      this.toastService.info(`Lien : ${shareUrl}`);
    }
  }

  reportPost(): void {
    if (!this.post) return;
    const reason = window.prompt('Pourquoi signalez-vous cette publication ? (3 caractères minimum)', 'Contenu inapproprié');
    if (!reason || reason.trim().length < 3) return;
    this.communityService.reportPost(this.post.id, reason.trim()).subscribe({
      next: () => {
        if (this.post) this.post.isReported = true;
        this.toastService.warning('Discussion signalée à l\'équipe de modération.');
      },
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Signalement impossible.'))
    });
  }

  deletePost(): void {
    if (!this.post || !window.confirm(`Supprimer « ${this.post.title} » ?`)) return;
    this.communityService.deletePost(this.post.id).subscribe({
      next: () => {
        this.toastService.success('Publication supprimée.');
        this.router.navigate(['/app/community']);
      },
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Suppression impossible.'))
    });
  }

  onSubmitComment(): void {
    if (!this.post || !this.newCommentText.trim() || this.isSubmittingComment) return;

    this.isSubmittingComment = true;
    this.communityService.addComment(this.post.id, this.newCommentText.trim()).subscribe({
      next: addedComment => {
        this.comments.push(addedComment);
        if (this.post) this.post.commentCount = this.comments.length;
        this.newCommentText = '';
        this.isSubmittingComment = false;
        this.toastService.success('Votre commentaire a été publié !');
      },
      error: err => {
        this.isSubmittingComment = false;
        this.toastService.error(this.communityService.errorMessage(err, 'Erreur lors de l\'envoi du commentaire.'));
      }
    });
  }

  editingCommentId: string | null = null;
  editingCommentText = '';

  startCommentEdit(comment: Comment): void {
    this.editingCommentId = comment.id;
    this.editingCommentText = comment.content;
  }

  cancelCommentEdit(): void {
    this.editingCommentId = null;
    this.editingCommentText = '';
  }

  saveComment(comment: Comment): void {
    const text = this.editingCommentText.trim();
    if (text.length < 2) {
      this.toastService.warning('Le commentaire doit comporter au moins 2 caractères.');
      return;
    }
    this.communityService.updateComment(comment.id, text).subscribe({
      next: updated => {
        comment.content = updated.content;
        this.cancelCommentEdit();
        this.toastService.success('Commentaire modifié.');
      },
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Modification impossible.'))
    });
  }

  deleteComment(comment: Comment): void {
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    this.communityService.deleteComment(comment.id).subscribe({
      next: () => {
        this.comments = this.comments.filter(c => c.id !== comment.id);
        if (this.post) this.post.commentCount = this.comments.length;
        this.toastService.success('Commentaire supprimé.');
      },
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Suppression impossible.'))
    });
  }

  reportComment(comment: Comment): void {
    const reason = window.prompt('Pourquoi signalez-vous ce commentaire ? (3 caractères minimum)', 'Propos irrespectueux');
    if (!reason || reason.trim().length < 3) return;
    this.communityService.reportComment(comment.id, reason.trim()).subscribe({
      next: () => this.toastService.warning('Commentaire signalé à l\'équipe de modération.'),
      error: err => this.toastService.error(this.communityService.errorMessage(err, 'Signalement impossible.'))
    });
  }

  getCategoryLabel(category?: string): string {
    return this.post?.categoryName ?? category ?? '';
  }

  getTypeLabel(type?: string): string {
    return type === 'QUESTION' ? 'Question' : 'Partage & conseil';
  }

  getInitials(name?: string): string {
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
}
