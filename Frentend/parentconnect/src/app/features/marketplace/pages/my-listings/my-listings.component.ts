import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Listing, ListingType, ListingStatus } from '../../../../shared/models';

@Component({
  selector: 'app-my-listings',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-listings.component.html',
  styleUrls: ['./my-listings.component.scss']
})
export class MyListingsComponent implements OnInit {
  listings: Listing[] = [];
  isLoading = true;
  selectedFilter: 'ALL' | ListingStatus = 'ALL';
  listingToDelete: Listing | null = null;
  isDeleting = false;

  constructor(
    private marketplaceService: MarketplaceService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loadMyListings();
  }

  loadMyListings(): void {
    this.isLoading = true;
    const user = this.authService.currentUser;
    const userId = user ? user.id : 'user_1';

    this.marketplaceService.getMyListings(userId).subscribe({
      next: (res) => {
        this.listings = res;
        this.isLoading = false;
      },
      error: () => {
        this.toastService.error('Impossible de charger vos annonces.');
        this.isLoading = false;
      }
    });
  }

  get filteredListings(): Listing[] {
    if (this.selectedFilter === 'ALL') return this.listings;
    return this.listings.filter(l => l.status === this.selectedFilter);
  }

  setFilter(filter: 'ALL' | ListingStatus): void {
    this.selectedFilter = filter;
  }

  confirmDelete(listing: Listing): void {
    this.listingToDelete = listing;
  }

  cancelDelete(): void {
    this.listingToDelete = null;
  }

  executeDelete(): void {
    if (!this.listingToDelete) return;
    this.isDeleting = true;
    const title = this.listingToDelete.title;

    this.marketplaceService.deleteListing(this.listingToDelete.id).subscribe({
      next: () => {
        this.listings = this.listings.filter(l => l.id !== this.listingToDelete?.id);
        this.toastService.success(`L'annonce "${title}" a été supprimée.`);
        this.listingToDelete = null;
        this.isDeleting = false;
      },
      error: () => {
        this.toastService.error('Erreur lors de la suppression de l’annonce.');
        this.isDeleting = false;
      }
    });
  }

  getStatusBadgeClass(status: ListingStatus): string {
    switch (status) {
      case 'AVAILABLE': return 'badge-success';
      case 'BORROWED': return 'badge-warning';
      case 'RESERVED': return 'badge-accent';
      case 'COMPLETED': return 'badge-neutral';
      case 'CANCELLED': return 'badge-error';
      default: return 'badge-neutral';
    }
  }

  getStatusLabel(status: ListingStatus): string {
    switch (status) {
      case 'AVAILABLE': return 'Disponible';
      case 'BORROWED': return 'En prêt';
      case 'RESERVED': return 'Réservé';
      case 'COMPLETED': return 'Terminé';
      case 'CANCELLED': return 'Annulé';
      default: return status;
    }
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
}
