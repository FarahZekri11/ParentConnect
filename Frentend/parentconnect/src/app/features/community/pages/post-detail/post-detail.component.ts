import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommunityService } from '../../services/community.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Post, Comment, User } from '../../../../shared/models';

@Component({
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
            this.isLoading = false;
          },
          error: () => {
            this.isLoading = false;
          }
        });
      },
      error: () => {
        this.isLoading = false;
        this.toastService.error('Erreur lors du chargement de la publication.');
      }
    });
  }

  toggleLikePost(): void {
    if (!this.post) return;

    this.communityService.likePost(this.post.id).subscribe({
      next: result => {
        if (this.post) {
          this.post.likeCount = result.likes;
          this.post.isLiked = result.isLiked;
          if (result.isLiked) {
            this.toastService.success('Publication aimée !');
          }
        }
      }
    });
  }

  toggleSavePost(): void {
    if (!this.post) return;

    this.communityService.toggleSavePost(this.post.id).subscribe({
      next: isSaved => {
        if (this.post) {
          this.post.isSaved = isSaved;
          this.toastService.success(
            isSaved ? 'Ajouté à vos favoris !' : 'Retiré de vos favoris.'
          );
        }
      }
    });
  }

  sharePost(): void {
    const shareUrl = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        this.toastService.info('Lien de la discussion copié !');
      });
    } else {
      this.toastService.info(`Lien copié : ${shareUrl}`);
    }
  }

  reportPost(): void {
    if (!this.post) return;

    if (confirm('Voulez-vous signaler cette publication à l\'équipe de modération ?')) {
      this.communityService.reportPost(this.post.id).subscribe(() => {
        if (this.post) this.post.isReported = true;
        this.toastService.warning('Discussion signalée avec succès.');
      });
    }
  }

  onSubmitComment(): void {
    if (!this.post || !this.newCommentText.trim() || this.isSubmittingComment) return;

    this.isSubmittingComment = true;
    const author = {
      id: this.currentUser ? this.currentUser.id : 'user_current',
      name: this.currentUser ? `${this.currentUser.firstName} ${this.currentUser.lastName}` : 'Parent anonyme',
      avatar: this.currentUser?.avatar || ''
    };

    this.communityService
      .addComment(this.post.id, this.newCommentText.trim(), author)
      .subscribe({
        next: addedComment => {
          this.comments.push(addedComment);
          if (this.post) {
            this.post.commentCount += 1;
          }
          this.newCommentText = '';
          this.isSubmittingComment = false;
          this.toastService.success('Votre commentaire a été publié !');
        },
        error: () => {
          this.isSubmittingComment = false;
          this.toastService.error('Erreur lors de l\'envoi du commentaire.');
        }
      });
  }

  toggleLikeComment(comment: Comment): void {
    this.communityService.likeComment(comment.id).subscribe({
      next: updated => {
        comment.likeCount = updated.likeCount;
        comment.isLiked = updated.isLiked;
      }
    });
  }

  getCategoryLabel(category?: string): string {
    if (!category) return '';
    const map: Record<string, string> = {
      HEALTH: 'Santé',
      SLEEP: 'Sommeil',
      NUTRITION: 'Nutrition',
      ACTIVITIES: 'Éveil & Activités',
      GEAR: 'Équipement',
      EMOTIONS: 'Émotions',
      PARENTING: 'Parentalité',
      EDUCATION: 'Éducation',
      OTHER: 'Autre'
    };
    return map[category] || category;
  }

  getTypeLabel(type?: string): string {
    if (!type) return '';
    const map: Record<string, string> = {
      QUESTION: 'Question',
      ADVICE: 'Conseil',
      RECOMMENDATION: 'Recommandation',
      DISCUSSION: 'Discussion'
    };
    return map[type] || type;
  }

  getInitials(name?: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  getUserInitials(): string {
    if (!this.currentUser) return 'M';
    return (this.currentUser.firstName[0] + this.currentUser.lastName[0]).toUpperCase();
  }
}
