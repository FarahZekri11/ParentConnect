import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommunityService } from './services/community.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Post, User } from '../../shared/models';

interface CategoryTab {
  key: string;
  label: string;
  icon: string;
}

interface TypeFilter {
  key: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './community.component.html',
  styleUrls: ['./community.component.scss']
})
export class CommunityComponent implements OnInit {
  posts: Post[] = [];
  isLoading = true;
  selectedCategory = 'ALL';
  selectedType = 'ALL';
  searchQuery = '';
  currentUser: User | null = null;

  categories: CategoryTab[] = [
    { key: 'ALL', label: 'Toutes', icon: 'bubble_chart' },
    { key: 'HEALTH', label: 'Santé', icon: 'health_and_safety' },
    { key: 'SLEEP', label: 'Sommeil', icon: 'bedtime' },
    { key: 'NUTRITION', label: 'Nutrition', icon: 'restaurant_menu' },
    { key: 'ACTIVITIES', label: 'Éveil', icon: 'toys' },
    { key: 'GEAR', label: 'Équipement', icon: 'stroller' },
    { key: 'EMOTIONS', label: 'Émotions', icon: 'sentiment_satisfied' }
  ];

  typeFilters: TypeFilter[] = [
    { key: 'ALL', label: 'Tous les échanges', icon: 'forum' },
    { key: 'QUESTION', label: 'Questions', icon: 'help_outline' },
    { key: 'ADVICE', label: 'Conseils', icon: 'lightbulb' },
    { key: 'RECOMMENDATION', label: 'Recommandations', icon: 'thumb_up' }
  ];

  trendingTopics = [
    { tag: '#dme', count: 18, desc: 'Diversification autonome' },
    { tag: '#sommeil', count: 32, desc: 'Nuits et siestes' },
    { tag: '#creche', count: 14, desc: 'Adaptation et garde' },
    { tag: '#motricitelibre', count: 21, desc: 'Développement moteur' },
    { tag: '#paris11', count: 29, desc: 'Vie de quartier' }
  ];

  constructor(
    private communityService: CommunityService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
    this.loadPosts();
  }

  loadPosts(): void {
    this.isLoading = true;
    this.communityService
      .getPosts(this.selectedCategory, this.selectedType, this.searchQuery)
      .subscribe({
        next: posts => {
          this.posts = posts;
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          this.toastService.error('Impossible de charger les publications.');
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

  onSearch(): void {
    this.loadPosts();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.loadPosts();
  }

  selectTopic(tag: string): void {
    this.searchQuery = tag.replace('#', '');
    this.loadPosts();
  }

  toggleLike(event: Event, post: Post): void {
    event.stopPropagation();
    event.preventDefault();

    this.communityService.likePost(post.id).subscribe({
      next: result => {
        post.likeCount = result.likes;
        post.isLiked = result.isLiked;
        if (result.isLiked) {
          this.toastService.success('Publication aimée !');
        }
      }
    });
  }

  toggleSave(event: Event, post: Post): void {
    event.stopPropagation();
    event.preventDefault();

    this.communityService.toggleSavePost(post.id).subscribe({
      next: isSaved => {
        post.isSaved = isSaved;
        this.toastService.success(
          isSaved ? 'Enregistré dans vos favoris !' : 'Retiré de vos favoris.'
        );
      }
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
      this.toastService.info(`Lien copié : ${shareUrl}`);
    }
  }

  reportPost(event: Event, post: Post): void {
    event.stopPropagation();
    event.preventDefault();

    if (confirm('Souhaitez-vous signaler cette publication pour modération ?')) {
      this.communityService.reportPost(post.id).subscribe(() => {
        post.isReported = true;
        this.toastService.warning('Publication signalée à l\'équipe de modération.');
      });
    }
  }

  getCategoryLabel(category: string): string {
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

  getTypeLabel(type: string): string {
    const map: Record<string, string> = {
      QUESTION: 'Question',
      ADVICE: 'Conseil',
      RECOMMENDATION: 'Recommandation',
      DISCUSSION: 'Discussion'
    };
    return map[type] || type;
  }

  getTypeBadgeClass(type: string): string {
    switch (type) {
      case 'QUESTION':
        return 'badge-question';
      case 'ADVICE':
        return 'badge-advice';
      case 'RECOMMENDATION':
        return 'badge-rec';
      default:
        return 'badge-discussion';
    }
  }

  getInitials(name: string): string {
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
