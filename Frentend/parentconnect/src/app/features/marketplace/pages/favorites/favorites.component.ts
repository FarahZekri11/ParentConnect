import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MarketplaceService, formatPrice } from '../../services/marketplace.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Listing, ListingType, ItemCondition } from '../../../../shared/models';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-favorites',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.scss']
})
export class FavoritesComponent implements OnInit {
  favorites: Listing[] = [];
  isLoading = true;

  constructor(
    private marketplaceService: MarketplaceService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loadFavorites();
  }

  loadFavorites(): void {
    this.isLoading = true;
    this.marketplaceService.getFavorites().subscribe({
      next: (res) => {
        this.favorites = res;
        this.isLoading = false;
      },
      error: () => {
        this.toastService.error('Impossible de charger vos favoris.');
        this.isLoading = false;
      }
    });
  }

  removeFavorite(event: Event, item: Listing): void {
    event.stopPropagation();
    event.preventDefault();
    this.marketplaceService.toggleFavorite(item.id);
    this.favorites = this.favorites.filter(f => f.id !== item.id);
    this.toastService.info(`"${item.title}" a été retiré de vos favoris.`);
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
      case 'NEW': return 'Neuf';
      case 'LIKE_NEW': return 'Comme neuf';
      case 'GOOD': return 'Très bon état';
      case 'FAIR': return 'Satisfaisant';
      default: return condition;
    }
  }

  getPriceDisplay(listing: Listing): string {
    if (listing.type === 'DONATION') return 'Gratuit (Don)';
    if (listing.type === 'LENDING') return (listing.price ?? 0) > 0 ? `Prêt · caution ${formatPrice(listing.price, listing.currency)}` : 'Prêt gratuit';
    if (listing.type === 'EXCHANGE') return 'Échange';
    if (listing.price !== undefined && listing.price !== null) {
      return formatPrice(listing.price, listing.currency);
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
