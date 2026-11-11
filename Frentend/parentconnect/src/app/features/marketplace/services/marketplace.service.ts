import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import {
  Listing,
  ListingQuery,
  ListingsResponse,
} from '../../../shared/models';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

export interface BorrowRequestData {
  _id: string;
  listingId: string;
  borrowerId: string;
  borrowerName?: string;
  borrowerEmail?: string;
  ownerId: string;
  startDate: Date;
  returnDate?: Date;
  notes?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'RETURNED' | 'CANCELLED';
  rejectionReason?: string;
  createdAt: Date;
}

export interface ListingReviewData {
  _id?: string;
  listingId: string;
  reviewerId: string;
  reviewerName?: string;
  rating: number;
  comment: string;
  createdAt?: Date;
}

@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private readonly apiUrl = `${environment.apiBaseUrl}/api/listings`;

  private favoritesSubject = new BehaviorSubject<string[]>(this.loadStoredFavorites());
  favorites$ = this.favoritesSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {
    this.refreshFavoritesFromBackend();
  }

  private loadStoredFavorites(): string[] {
    try {
      const stored = localStorage.getItem('pc_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveFavorites(favs: string[]): void {
    try {
      localStorage.setItem('pc_favorites', JSON.stringify(favs));
    } catch {
      // ignore
    }
  }

  /**
   * Sync persistent favorites with backend MongoDB if logged in
   */
  refreshFavoritesFromBackend(): void {
    if (this.authService.isLoggedIn) {
      this.http
        .get<string[]>(`${this.apiUrl}/user/favorites/ids`)
        .pipe(
          catchError(() => of(this.loadStoredFavorites())),
        )
        .subscribe((ids) => {
          if (Array.isArray(ids)) {
            this.favoritesSubject.next(ids);
            this.saveFavorites(ids);
          }
        });
    }
  }

  private getDefaultImageForCategory(cat?: string): string {
    switch (cat) {
      case 'STROLLERS':
        return 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80';
      case 'CLOTHING':
        return 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=600&q=80';
      case 'FURNITURE':
        return 'https://images.unsplash.com/photo-1541089404510-5c9a779841fc?w=600&q=80';
      case 'TOYS':
        return 'https://images.unsplash.com/photo-1596460107916-430662021049?w=600&q=80';
      case 'PUERICULTURE':
        return 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&q=80';
      case 'FEEDING':
        return 'https://images.unsplash.com/photo-1584839619566-4899553b3df8?w=600&q=80';
      case 'SAFETY':
        return 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=600&q=80';
      default:
        return 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80';
    }
  }

  private getOwnerName(ownerId?: string): string {
    if (!ownerId) return 'Parent du quartier';
    if (ownerId === 'user_1' || ownerId.includes('farah')) return 'Farah Zekri';
    if (ownerId === 'user_2' || ownerId.includes('parent_test') || ownerId.includes('marie')) return 'Marie L.';
    if (ownerId === 'user_3') return 'Sophie M.';
    if (ownerId === 'user_4') return 'Lucas P.';
    if (ownerId === 'user_5') return 'Emma R.';
    return 'Parent du quartier';
  }

  private mapBackendListing(raw: any): Listing {
    const favs = this.favoritesSubject.value;
    const id = raw._id || raw.id;
    const images =
      raw.images && raw.images.length > 0
        ? raw.images
        : [this.getDefaultImageForCategory(raw.category)];

    return {
      id,
      title: raw.title,
      description: raw.description,
      category: raw.category,
      condition: raw.condition,
      type: raw.type,
      status: raw.status || 'AVAILABLE',
      price: raw.price ?? 0,
      currency: raw.currency || 'EUR',
      exchangePreferences: raw.exchangePreferences,
      targetAgeRange: raw.targetAgeRange,
      images,
      tags: raw.tags || [],
      location: raw.location || {},
      ownerId: raw.ownerId || 'user_1',
      ownerName: raw.ownerName || this.getOwnerName(raw.ownerId),
      ownerAvatar: raw.ownerAvatar || '',
      familyId: raw.familyId,
      borrowDetails: raw.borrowDetails
        ? {
            borrowerId: raw.borrowDetails.borrowerId,
            startDate: new Date(raw.borrowDetails.startDate),
            returnDate: raw.borrowDetails.returnDate
              ? new Date(raw.borrowDetails.returnDate)
              : undefined,
            returnedAt: raw.borrowDetails.returnedAt
              ? new Date(raw.borrowDetails.returnedAt)
              : undefined,
            notes: raw.borrowDetails.notes,
          }
        : undefined,
      isFavorited: favs.includes(id),
      createdAt: new Date(raw.createdAt || Date.now()),
      updatedAt: new Date(raw.updatedAt || Date.now()),
    };
  }

  /**
   * GET /api/listings with search, filters, pagination, and sorting
   */
  getListings(query: ListingQuery = {}): Observable<ListingsResponse> {
    let params = new HttpParams();

    if (query.search) params = params.set('search', query.search);
    if (query.category) params = params.set('category', query.category);
    if (query.type) params = params.set('type', query.type);
    if (query.condition) params = params.set('condition', query.condition);
    if (query.status) params = params.set('status', query.status);
    if (query.city) params = params.set('city', query.city);
    if (query.postalCode) params = params.set('postalCode', query.postalCode);
    if (query.ownerId) params = params.set('ownerId', query.ownerId);
    if (query.minPrice !== undefined && query.minPrice !== null)
      params = params.set('minPrice', query.minPrice.toString());
    if (query.maxPrice !== undefined && query.maxPrice !== null)
      params = params.set('maxPrice', query.maxPrice.toString());
    if (query.page) params = params.set('page', query.page.toString());
    if (query.limit) params = params.set('limit', query.limit.toString());
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortOrder) params = params.set('sortOrder', query.sortOrder);

    return this.http
      .get<{
        listings: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(this.apiUrl, { params })
      .pipe(
        map((res) => ({
          listings: res.listings.map((l) => this.mapBackendListing(l)),
          total: res.total,
          page: res.page,
          limit: res.limit,
          totalPages: res.totalPages,
        })),
      );
  }

  /**
   * GET /api/listings/:id
   */
  getListingById(id: string): Observable<Listing | undefined> {
    return this.http.get<any>(`${this.apiUrl}/${id}`).pipe(
      map((raw) => this.mapBackendListing(raw)),
      catchError((err) => {
        console.error('Error fetching listing by ID:', err);
        return of(undefined);
      }),
    );
  }

  /**
   * POST /api/listings
   */
  createListing(
    data: Partial<Listing>,
    ownerId: string,
    ownerName: string,
  ): Observable<Listing> {
    const payload = {
      title: data.title,
      description: data.description,
      category: data.category,
      condition: data.condition,
      type: data.type,
      price: data.type === 'SALE' ? (data.price ?? 0) : 0,
      currency: data.currency || 'EUR',
      exchangePreferences: data.exchangePreferences,
      targetAgeRange: data.targetAgeRange,
      images: data.images || [],
      tags: data.tags || [],
      location: data.location || {},
    };

    return this.http.post<any>(this.apiUrl, payload).pipe(
      map((res) => {
        const mapped = this.mapBackendListing(res);
        mapped.ownerName = ownerName;
        return mapped;
      }),
    );
  }

  /**
   * PUT /api/listings/:id
   */
  updateListing(id: string, data: Partial<Listing>): Observable<Listing> {
    const payload: any = {
      title: data.title,
      description: data.description,
      category: data.category,
      condition: data.condition,
      type: data.type,
      price: data.type === 'SALE' ? (data.price ?? 0) : 0,
      currency: data.currency || 'EUR',
      exchangePreferences: data.exchangePreferences,
      targetAgeRange: data.targetAgeRange,
      images: data.images,
      tags: data.tags,
      location: data.location,
    };
    if (data.status) {
      payload.status = data.status;
    }

    return this.http
      .put<any>(`${this.apiUrl}/${id}`, payload)
      .pipe(map((res) => this.mapBackendListing(res)));
  }

  /**
   * DELETE /api/listings/:id
   */
  deleteListing(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // =========================================================================
  // BORROW REQUESTS WORKFLOW
  // =========================================================================

  /**
   * Submit a formal borrow request
   */
  createBorrowRequest(
    listingId: string,
    startDate: Date,
    returnDate?: Date,
    notes?: string,
  ): Observable<BorrowRequestData> {
    const payload = {
      startDate: startDate.toISOString(),
      returnDate: returnDate ? returnDate.toISOString() : undefined,
      notes,
    };

    return this.http.post<BorrowRequestData>(
      `${this.apiUrl}/${listingId}/borrow-requests`,
      payload,
    );
  }

  /**
   * Get borrow requests made by the current user
   */
  getMyBorrowRequests(): Observable<BorrowRequestData[]> {
    return this.http.get<BorrowRequestData[]>(
      `${this.apiUrl}/borrow-requests/my-requests`,
    );
  }

  /**
   * Get incoming borrow requests for items owned by current user
   */
  getIncomingBorrowRequests(): Observable<BorrowRequestData[]> {
    return this.http.get<BorrowRequestData[]>(
      `${this.apiUrl}/borrow-requests/incoming`,
    );
  }

  /**
   * Accept borrow request (owner)
   */
  acceptBorrowRequest(requestId: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl}/borrow-requests/${requestId}/accept`,
      {},
    );
  }

  /**
   * Reject borrow request (owner)
   */
  rejectBorrowRequest(requestId: string, reason?: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl}/borrow-requests/${requestId}/reject`,
      { reason },
    );
  }

  /**
   * Cancel pending borrow request (borrower)
   */
  cancelBorrowRequest(requestId: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiUrl}/borrow-requests/${requestId}/cancel`,
      {},
    );
  }

  /**
   * Direct borrow (backward compatibility)
   */
  borrowListing(
    id: string,
    borrowerId: string,
    notes?: string,
    returnDate?: Date,
  ): Observable<Listing> {
    const payload = {
      borrowerId,
      startDate: new Date(),
      returnDate: returnDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notes: notes || 'Demande de prêt',
    };

    return this.http
      .post<any>(`${this.apiUrl}/${id}/borrow`, payload)
      .pipe(map((res) => this.mapBackendListing(res)));
  }

  /**
   * Return borrowed item
   */
  returnListing(id: string): Observable<Listing> {
    return this.http
      .post<any>(`${this.apiUrl}/${id}/return`, {})
      .pipe(map((res) => this.mapBackendListing(res)));
  }

  // =========================================================================
  // PERSISTENT FAVORITES (MongoDB backend + Local cache)
  // =========================================================================

  getMyListings(userId: string): Observable<Listing[]> {
    return this.getListings({ ownerId: userId, limit: 100 }).pipe(
      map((res) => res.listings),
    );
  }

  getFavorites(): Observable<Listing[]> {
    if (this.authService.isLoggedIn) {
      return this.http
        .get<any[]>(`${this.apiUrl}/user/favorites`)
        .pipe(
          map((raws) => raws.map((r) => this.mapBackendListing(r))),
          catchError(() => {
            const favs = this.favoritesSubject.value;
            return this.getListings({ limit: 100 }).pipe(
              map((res) => res.listings.filter((l) => favs.includes(l.id))),
            );
          }),
        );
    }

    const favs = this.favoritesSubject.value;
    return this.getListings({ limit: 100 }).pipe(
      map((res) => res.listings.filter((l) => favs.includes(l.id))),
    );
  }

  toggleFavorite(id: string): void {
    const favs = this.favoritesSubject.value;
    const isFav = favs.includes(id);
    const newFavs = isFav ? favs.filter((f) => f !== id) : [...favs, id];

    this.favoritesSubject.next(newFavs);
    this.saveFavorites(newFavs);

    if (this.authService.isLoggedIn) {
      if (isFav) {
        this.http
          .delete(`${this.apiUrl}/${id}/favorite`)
          .subscribe({ error: () => {} });
      } else {
        this.http
          .post(`${this.apiUrl}/${id}/favorite`, {})
          .subscribe({ error: () => {} });
      }
    }
  }

  // =========================================================================
  // REVIEWS & RATINGS
  // =========================================================================

  createReview(
    listingId: string,
    rating: number,
    comment: string,
  ): Observable<ListingReviewData> {
    return this.http.post<ListingReviewData>(
      `${this.apiUrl}/${listingId}/reviews`,
      { rating, comment },
    );
  }

  getReviews(listingId: string): Observable<{
    listingId: string;
    averageRating: number;
    totalReviews: number;
    reviews: ListingReviewData[];
  }> {
    return this.http.get<any>(`${this.apiUrl}/${listingId}/reviews`);
  }
}
