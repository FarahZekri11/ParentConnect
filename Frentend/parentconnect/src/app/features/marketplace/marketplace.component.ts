import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MarketplaceService, formatPrice } from './services/marketplace.service';
import { ToastService } from '../../shared/services/toast.service';
import {
  Listing,
  ItemCategory,
  ListingType,
  ItemCondition,
  ListingQuery
} from '../../shared/models';

interface CategoryTab {
  key: string;
  label: string;
  icon: string;
}

interface TypeTab {
  key: string;
  label: string;
  badgeClass: string;
}

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-marketplace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './marketplace.component.html',
  styleUrls: ['./marketplace.component.scss']
})
export class MarketplaceComponent implements OnInit, OnDestroy {
  listings: Listing[] = [];
  isLoading = true;
  errorMessage = '';

  // Search & Filters state
  searchQuery = '';
  selectedCategory: string = 'ALL';
  selectedType: string = 'ALL';
  selectedCondition: string = 'ALL';
  sortBy: string = 'recent'; // 'recent', 'price_asc', 'price_desc'
  minPrice: number | null = null;
  maxPrice: number | null = null;
  selectedCity = '';
  showMobileFilters = false;

  private searchSubject = new Subject<string>();
  private sub = new Subscription();

  // Categories config
  categories: CategoryTab[] = [
    { key: 'ALL', label: 'Tout', icon: 'grid_view' },
    { key: 'PUERICULTURE', label: 'Puériculture', icon: 'child_care' },
    { key: 'STROLLERS', label: 'Poussettes', icon: 'stroller' },
    { key: 'CLOTHING', label: 'Vêtements', icon: 'checkroom' },
    { key: 'FURNITURE', label: 'Meubles', icon: 'crib' },
    { key: 'TOYS', label: 'Jouets', icon: 'toys' },
    { key: 'FEEDING', label: 'Repas', icon: 'restaurant' },
    { key: 'SAFETY', label: 'Sécurité', icon: 'verified_user' },
    { key: 'MATERNITY', label: 'Maternité', icon: 'pregnant_woman' },
    { key: 'OTHER', label: 'Autre', icon: 'more_horiz' }
  ];

  // Types config
  typeTabs: TypeTab[] = [
    { key: 'ALL', label: 'Tous', badgeClass: '' },
    { key: 'DONATION', label: 'À donner', badgeClass: 'badge-donation' },
    { key: 'SALE', label: 'À vendre', badgeClass: 'badge-sale' },
    { key: 'LENDING', label: 'À prêter', badgeClass: 'badge-lending' },
    { key: 'EXCHANGE', label: 'À échanger', badgeClass: 'badge-exchange' }
  ];

  // Conditions
  conditions = [
    { value: 'ALL', label: 'Tous les états' },
    { value: 'NEW', label: 'Neuf avec étiquette' },
    { value: 'LIKE_NEW', label: 'Comme neuf' },
    { value: 'GOOD', label: 'Très bon état' },
    { value: 'FAIR', label: 'État satisfaisant' }
  ];

  constructor(
    private marketplaceService: MarketplaceService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Listen for query params if any
    this.sub.add(
      this.route.queryParams.subscribe(params => {
        if (params['category']) this.selectedCategory = params['category'];
        if (params['type']) this.selectedType = params['type'];
        if (params['q']) this.searchQuery = params['q'];
        this.loadListings();
      })
    );

    // Debounced search
    this.sub.add(
      this.searchSubject.pipe(
        debounceTime(350),
        distinctUntilChanged()
      ).subscribe(() => {
        this.loadListings();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.searchSubject.next(value);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.loadListings();
  }

  selectCategory(categoryKey: string): void {
    this.selectedCategory = categoryKey;
    this.loadListings();
  }

  selectType(typeKey: string): void {
    this.selectedType = typeKey;
    this.loadListings();
  }

  onFilterChange(): void {
    this.loadListings();
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'ALL';
    this.selectedType = 'ALL';
    this.selectedCondition = 'ALL';
    this.sortBy = 'recent';
    this.minPrice = null;
    this.maxPrice = null;
    this.selectedCity = '';
    this.loadListings();
  }

  loadListings(): void {
    this.isLoading = true;
    this.errorMessage = '';

    const query: ListingQuery = {};

    if (this.searchQuery.trim()) {
      query.search = this.searchQuery.trim();
    }
    if (this.selectedCategory !== 'ALL') {
      query.category = this.selectedCategory as ItemCategory;
    }
    if (this.selectedType !== 'ALL') {
      query.type = this.selectedType as ListingType;
    }
    if (this.selectedCondition !== 'ALL') {
      query.condition = this.selectedCondition as ItemCondition;
    }
    if (this.minPrice !== null && this.minPrice !== undefined && this.minPrice >= 0) {
      query.minPrice = this.minPrice;
    }
    if (this.maxPrice !== null && this.maxPrice !== undefined && this.maxPrice >= 0) {
      query.maxPrice = this.maxPrice;
    }
    if (this.selectedCity.trim()) {
      query.city = this.selectedCity.trim();
    }

    this.marketplaceService.getListings(query).subscribe({
      next: (res) => {
        let items = res.listings;
        if (this.sortBy === 'price_asc') {
          items = [...items].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
        } else if (this.sortBy === 'price_desc') {
          items = [...items].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        } else if (this.sortBy === 'recent') {
          items = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        this.listings = items;
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = 'Impossible de charger les annonces. Veuillez réessayer.';
        this.isLoading = false;
      }
    });
  }

  toggleFavorite(event: Event, listing: Listing): void {
    event.stopPropagation();
    event.preventDefault();
    this.marketplaceService.toggleFavorite(listing.id);
    listing.isFavorited = !listing.isFavorited;
    if (listing.isFavorited) {
      this.toastService.success(`"${listing.title}" ajouté aux favoris`);
    } else {
      this.toastService.info(`"${listing.title}" retiré des favoris`);
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
      case 'FAIR': return 'État satisfaisant';
      default: return condition;
    }
  }

  getCategoryLabel(category: ItemCategory): string {
    const found = this.categories.find(c => c.key === category);
    return found ? found.label : category;
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
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    target.src = 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80';
  }
}
