import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MarketplaceService, formatPrice } from '../../services/marketplace.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Listing, ListingType, ItemCondition, ItemCategory } from '../../../../shared/models';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-listing-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './listing-detail.component.html',
  styleUrls: ['./listing-detail.component.scss']
})
export class ListingDetailComponent implements OnInit {
  listing: Listing | null = null;
  isLoading = true;
  errorMessage = '';
  selectedImageIndex = 0;

  // Modals state
  showBorrowModal = false;
  borrowStartDate: string = '';
  borrowReturnDate: string = '';
  borrowNotes: string = '';
  isSubmittingBorrow = false;

  showReportModal = false;
  reportReason = 'INAPPROPRIATE';
  reportDetails = '';

  currentUserId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private marketplaceService: MarketplaceService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUser;
    this.currentUserId = user ? user.id : 'user_1';

    // Set default borrow dates (start today, return in 7 days)
    const today = new Date();
    this.borrowStartDate = today.toISOString().split('T')[0];
    const inAWeek = new Date();
    inAWeek.setDate(today.getDate() + 7);
    this.borrowReturnDate = inAWeek.toISOString().split('T')[0];

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadListing(id);
    } else {
      this.errorMessage = 'Identifiant d’annonce manquant.';
      this.isLoading = false;
    }
  }

  loadListing(id: string): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.marketplaceService.getListingById(id).subscribe({
      next: (res) => {
        if (!res) {
          this.errorMessage = 'Cette annonce est introuvable ou a été supprimée.';
        } else {
          this.listing = res;
        }
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Erreur lors de la récupération de l’annonce.';
        this.isLoading = false;
      }
    });
  }

  selectImage(idx: number): void {
    this.selectedImageIndex = idx;
  }

  toggleFavorite(): void {
    if (!this.listing) return;
    this.marketplaceService.toggleFavorite(this.listing.id);
    this.listing.isFavorited = !this.listing.isFavorited;
    if (this.listing.isFavorited) {
      this.toastService.success(`"${this.listing.title}" ajouté à vos favoris`);
    } else {
      this.toastService.info(`"${this.listing.title}" retiré de vos favoris`);
    }
  }

  openBorrowModal(): void {
    this.showBorrowModal = true;
  }

  closeBorrowModal(): void {
    this.showBorrowModal = false;
  }

  submitBorrow(): void {
    if (!this.listing) return;
    if (!this.borrowReturnDate) {
      this.toastService.warning('Veuillez spécifier une date de retour prévue.');
      return;
    }

    this.isSubmittingBorrow = true;
    const returnDateObj = new Date(this.borrowReturnDate);

    this.marketplaceService.borrowListing(this.listing.id, this.currentUserId, this.borrowNotes, returnDateObj).subscribe({
      next: (updated) => {
        this.listing = updated;
        this.isSubmittingBorrow = false;
        this.showBorrowModal = false;
        this.toastService.success('Votre demande de prêt a été envoyée au propriétaire !');
      },
      error: () => {
        this.toastService.error('Erreur lors de la demande de prêt.');
        this.isSubmittingBorrow = false;
      }
    });
  }

  openReportModal(): void {
    this.showReportModal = true;
  }

  closeReportModal(): void {
    this.showReportModal = false;
    this.reportDetails = '';
  }

  submitReport(): void {
    this.toastService.success('Signalement transmis à notre équipe de modération. Merci !');
    this.closeReportModal();
  }

  getTypeLabel(type: ListingType): string {
    switch (type) {
      case 'DONATION': return 'Don';
      case 'SALE': return 'À vendre';
      case 'LENDING': return 'Prêt';
      case 'EXCHANGE': return 'Échange';
      default: return type;
    }
  }

  getTypeBadgeClass(type: ListingType): string {
    switch (type) {
      case 'DONATION': return 'badge-donation';
      case 'SALE': return 'badge-sale';
      case 'LENDING': return 'badge-lending';
      case 'EXCHANGE': return 'badge-exchange';
      default: return 'badge-neutral';
    }
  }

  getConditionLabel(condition: ItemCondition): string {
    switch (condition) {
      case 'NEW': return 'Neuf avec étiquette';
      case 'LIKE_NEW': return 'Comme neuf';
      case 'GOOD': return 'Très bon état';
      case 'FAIR': return 'État satisfaisant';
      default: return condition;
    }
  }

  getPriceDisplay(): string {
    if (!this.listing) return '';
    if (this.listing.type === 'DONATION') return 'Gratuit (Don)';
    if (this.listing.type === 'LENDING') return (this.listing.price ?? 0) > 0 ? `Prêt · caution ${formatPrice(this.listing.price, this.listing.currency)}` : 'Prêt gratuit';
    if (this.listing.type === 'EXCHANGE') return 'Troc / Échange';
    if (this.listing.price !== undefined && this.listing.price !== null) {
      return formatPrice(this.listing.price, this.listing.currency);
    }
    return 'Prix sur demande';
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    target.src = 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80';
  }
}
