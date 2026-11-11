import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { GeoService } from '../../core/services/geo.service';
import { AuthService } from '../../core/services/auth.service';
import {
  UserLocation,
  NearbyParent,
  Neighborhood,
  MeetingPoint,
  TrustCircle,
  CircleLevel,
  AddressVerification,
  MeetingPointType,
  ProximityResult
} from '../../core/models/geo.models';

type TabType = 'nearby' | 'meeting-points' | 'circles' | 'verification';

@Component({
  selector: 'app-neighborhood',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './neighborhood.component.html',
  styleUrls: ['./neighborhood.component.scss']
})
export class NeighborhoodComponent implements OnInit, OnDestroy {
  activeTab: TabType = 'nearby';

  // State
  currentLocation: UserLocation | null = null;
  nearbyParents: NearbyParent[] = [];
  neighborhoods: Neighborhood[] = [];
  meetingPoints: MeetingPoint[] = [];
  trustCircles: TrustCircle[] = [];
  myVerification: AddressVerification | null = null;

  // Filters
  selectedRadius = 2500;
  radiusOptions = [
    { label: '500 m', value: 500 },
    { label: '1 km', value: 1000 },
    { label: '2.5 km', value: 2500 },
    { label: '5 km', value: 5000 }
  ];

  selectedNeighborhoodId = '';
  selectedMeetingPointType: 'all' | MeetingPointType = 'all';
  searchFilter = '';

  // Proximity testing
  selectedParentForProximity: NearbyParent | null = null;
  proximityCalculationResult: ProximityResult | null = null;
  isCalculatingProximity = false;

  // Modals
  showLocationModal = false;
  modalLng = 10.1815;
  modalLat = 36.8065;
  isGpsLoading = false;

  showCircleModal = false;
  modalCircleLevel: CircleLevel = 'close';
  modalMemberInput = '';

  // Pending neighbor verification requests mock list
  pendingNeighborVerifications = [
    {
      id: 'verif_req_01',
      userId: 'parent_amira',
      userName: 'Amira T.',
      neighborhood: 'Lafayette',
      date: new Date(Date.now() - 3600 * 1000 * 5),
      validationsReceived: 1,
      validationsRequired: 2
    },
    {
      id: 'verif_req_02',
      userId: 'parent_yassine',
      userName: 'Yassine K.',
      neighborhood: 'Lafayette',
      date: new Date(Date.now() - 3600 * 1000 * 22),
      validationsReceived: 0,
      validationsRequired: 2
    }
  ];

  // Feedback Toast
  toast: { message: string; type: 'success' | 'error' | 'info' } | null = null;
  private toastTimeout: any;

  // Loading
  isLoading = false;

  private subs = new Subscription();

  constructor(
    private geoService: GeoService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadInitialData();

    // Subscribe to reactive location
    this.subs.add(
      this.geoService.currentLocation$.subscribe(loc => {
        this.currentLocation = loc;
        if (loc?.location) {
          this.modalLng = loc.location.coordinates[0];
          this.modalLat = loc.location.coordinates[1];
        }
      })
    );

    // Subscribe to trust circles
    this.subs.add(
      this.geoService.circles$.subscribe(circles => {
        this.trustCircles = circles;
      })
    );

    // Subscribe to verification status
    this.subs.add(
      this.geoService.myVerification$.subscribe(verif => {
        this.myVerification = verif;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  loadInitialData(): void {
    this.isLoading = true;

    // 1. Get neighborhoods
    this.geoService.getNeighborhoods().subscribe(nhList => {
      this.neighborhoods = nhList;
      if (nhList.length > 0 && !this.selectedNeighborhoodId) {
        this.selectedNeighborhoodId = nhList[0].id;
      }
    });

    // 2. Get user location & nearby parents
    this.geoService.getMyLocation().subscribe(loc => {
      this.currentLocation = loc;
      const coords = loc?.location?.coordinates || [10.1815, 36.8065];
      this.modalLng = coords[0];
      this.modalLat = coords[1];

      this.fetchNearby(coords[0], coords[1], this.selectedRadius);
    });

    // 3. Get meeting points
    this.geoService.getMeetingPoints().subscribe(mps => {
      this.meetingPoints = mps;
      this.isLoading = false;
    });

    // 4. Get circles
    this.geoService.getTrustCircles().subscribe();
  }

  setTab(tab: TabType): void {
    this.activeTab = tab;
  }

  fetchNearby(lng: number, lat: number, radius: number): void {
    this.geoService.getNearbyParents(lng, lat, radius).subscribe(parents => {
      this.nearbyParents = parents;
    });
  }

  onRadiusChange(radius: number): void {
    this.selectedRadius = radius;
    if (this.currentLocation?.location) {
      const [lng, lat] = this.currentLocation.location.coordinates;
      this.fetchNearby(lng, lat, radius);
    }
  }

  // ============================================================================
  // Location Updates & Browser GPS
  // ============================================================================

  openLocationModal(): void {
    if (this.currentLocation?.location) {
      this.modalLng = this.currentLocation.location.coordinates[0];
      this.modalLat = this.currentLocation.location.coordinates[1];
    }
    this.showLocationModal = true;
  }

  closeLocationModal(): void {
    this.showLocationModal = false;
  }

  useCurrentGps(): void {
    if (!navigator.geolocation) {
      this.showToast('La géolocalisation n’est pas supportée par votre navigateur.', 'error');
      return;
    }

    this.isGpsLoading = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.modalLng = Number(pos.coords.longitude.toFixed(6));
        this.modalLat = Number(pos.coords.latitude.toFixed(6));
        this.isGpsLoading = false;
        this.showToast('Coordonnées GPS captées ! Cliquez sur "Sauvegarder" pour appliquer le floutage.', 'info');
      },
      err => {
        this.isGpsLoading = false;
        // Fallback default coordinates (Lafayette - Tunis)
        this.modalLng = 10.1815;
        this.modalLat = 36.8065;
        this.showToast('Position GPS inaccessible. Coordonnées par défaut de Tunis appliquées.', 'info');
      },
      { timeout: 8000 }
    );
  }

  selectPresetNeighborhood(nh: Neighborhood): void {
    this.modalLng = nh.center.coordinates[0];
    this.modalLat = nh.center.coordinates[1];
  }

  saveLocation(): void {
    this.geoService.updateLocation(this.modalLng, this.modalLat).subscribe(updated => {
      this.currentLocation = updated;
      this.closeLocationModal();
      this.showToast('Position mise à jour ! Floutage serveur ~200m activé.', 'success');
      this.fetchNearby(this.modalLng, this.modalLat, this.selectedRadius);
    });
  }

  // ============================================================================
  // Trust Circles
  // ============================================================================

  getCircle(level: CircleLevel): TrustCircle | undefined {
    return this.trustCircles.find(c => c.level === level);
  }

  openCircleModal(level: CircleLevel): void {
    this.modalCircleLevel = level;
    this.modalMemberInput = '';
    this.showCircleModal = true;
  }

  closeCircleModal(): void {
    this.showCircleModal = false;
  }

  addMemberToCircle(): void {
    const member = this.modalMemberInput.trim();
    if (!member) return;

    const existing = this.getCircle(this.modalCircleLevel);
    const members = existing ? [...existing.members] : [];

    if (!members.includes(member)) {
      members.push(member);
      this.geoService.saveTrustCircle(this.modalCircleLevel, members).subscribe(() => {
        this.showToast(`Membre "${member}" ajouté au cercle ${this.modalCircleLevel} !`, 'success');
        this.closeCircleModal();
        // Refresh nearby parents badges
        if (this.currentLocation?.location) {
          const [lng, lat] = this.currentLocation.location.coordinates;
          this.fetchNearby(lng, lat, this.selectedRadius);
        }
      });
    } else {
      this.showToast('Ce parent fait déjà partie de ce cercle.', 'info');
    }
  }

  removeMemberFromCircle(level: CircleLevel, member: string): void {
    const existing = this.getCircle(level);
    if (!existing) return;

    const updatedMembers = existing.members.filter(m => m !== member);
    this.geoService.saveTrustCircle(level, updatedMembers).subscribe(() => {
      this.showToast(`Membre "${member}" retiré du cercle.`, 'info');
      // Refresh nearby parents badges
      if (this.currentLocation?.location) {
        const [lng, lat] = this.currentLocation.location.coordinates;
        this.fetchNearby(lng, lat, this.selectedRadius);
      }
    });
  }

  quickAddToCircle(parent: NearbyParent, level: CircleLevel): void {
    const existing = this.getCircle(level);
    const members = existing ? [...existing.members] : [];

    if (!members.includes(parent.user_id)) {
      members.push(parent.user_id);
      this.geoService.saveTrustCircle(level, members).subscribe(() => {
        parent.trustLevel = level;
        this.showToast(`${parent.displayName} ajouté à votre cercle ${level === 'close' ? 'Proche' : 'Quartier'} !`, 'success');
      });
    } else {
      this.showToast('Déjà présent dans ce cercle.', 'info');
    }
  }

  // ============================================================================
  // Safe Meeting Points
  // ============================================================================

  get filteredMeetingPoints(): MeetingPoint[] {
    return this.meetingPoints.filter(mp => {
      const matchType = this.selectedMeetingPointType === 'all' || mp.type === this.selectedMeetingPointType;
      const matchNh = !this.selectedNeighborhoodId || mp.neighborhood_id === this.selectedNeighborhoodId;
      return matchType && matchNh;
    });
  }

  // ============================================================================
  // Address Verification Flow
  // ============================================================================

  requestAddressVerification(): void {
    this.geoService.requestAddressVerification('neighbor_validation').subscribe(res => {
      this.myVerification = res;
      this.showToast('Demande de vérification d’adresse envoyée aux voisins du quartier !', 'success');
    });
  }

  validateNeighbor(req: any): void {
    this.geoService.validateNeighborAddress(req.id).subscribe(res => {
      req.validationsReceived += 1;
      this.showToast(`Vous avez validé l'adresse de ${req.userName} avec succès !`, 'success');
    });
  }

  // ============================================================================
  // Direct Proximity Calculation
  // ============================================================================

  testProximity(parent: NearbyParent): void {
    this.selectedParentForProximity = parent;
    this.isCalculatingProximity = true;
    this.proximityCalculationResult = null;

    this.geoService.getProximityWithUser(parent.user_id).subscribe(res => {
      this.proximityCalculationResult = res;
      this.isCalculatingProximity = false;
    });
  }

  closeProximityModal(): void {
    this.selectedParentForProximity = null;
    this.proximityCalculationResult = null;
  }

  // ============================================================================
  // UI Helpers
  // ============================================================================

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.toast = { message, type };
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toast = null;
    }, 4500);
  }

  getMeetingPointIcon(type: MeetingPointType): string {
    switch (type) {
      case 'park': return 'park';
      case 'daycare': return 'child_care';
      case 'town_hall': return 'account_balance';
      default: return 'place';
    }
  }

  getMeetingPointTypeLabel(type: MeetingPointType): string {
    switch (type) {
      case 'park': return 'Parc public';
      case 'daycare': return 'Crèche / École';
      case 'town_hall': return 'Mairie / Espace public';
      default: return 'Lieu sûr';
    }
  }
}
