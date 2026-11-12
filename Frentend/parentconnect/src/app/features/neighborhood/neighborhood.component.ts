import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import * as L from 'leaflet';
import { GeoService } from '../../core/services/geo.service';
import { GeocodedPlace, GeocodingService } from '../../core/services/geocoding.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { environment } from '../../../environments/environment';
import {
  AddressVerification,
  CircleLevel,
  MeetingPoint,
  MeetingPointType,
  NearbyParent,
  Neighborhood,
  TrustCircle,
  UserLocation,
} from '../../core/models/geo.models';

type TabType = 'services' | 'meeting-points' | 'circles' | 'verification';

/** Élément affiché sur la carte et dans la liste « à proximité ». */
interface NearbyItem {
  id: string;
  kind: 'event' | 'listing';
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  distanceKm: number;
  link: string;
}

const DEFAULT_CENTER: [number, number] = [36.8065, 10.1815]; // Tunis : simple point de vue initial, jamais enregistré

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, carte) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-neighborhood',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './neighborhood.component.html',
  styleUrls: ['./neighborhood.component.scss']
})
export class NeighborhoodComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapEl') mapEl?: ElementRef<HTMLDivElement>;

  activeTab: TabType = 'services';
  readonly isAdmin: boolean;

  // Position
  currentLocation: UserLocation | null = null;
  locationLoading = true;
  locating = false;
  /** Centre de recherche : ma position floutée, ou une ville choisie (non enregistrée) */
  searchCenter: { lat: number; lng: number; label: string } | null = null;

  // Recherche de ville (OpenStreetMap Nominatim)
  cityQuery = '';
  cityResults: GeocodedPlace[] = [];
  searchingCity = false;

  // Services à proximité
  readonly radiusOptions = [5, 10, 20];
  radiusKm = 5;
  searching = false;
  hasSearched = false;
  nearbyEvents: NearbyItem[] = [];
  nearbyListings: NearbyItem[] = [];
  nearbyParents: NearbyParent[] = [];
  nearbyMeetingPoints: MeetingPoint[] = [];

  // Données de référence
  neighborhoods: Neighborhood[] = [];
  meetingPoints: MeetingPoint[] = [];
  trustCircles: TrustCircle[] = [];
  myVerification: AddressVerification | null = null;

  // Administration des points de rencontre
  pickingPoint = false;
  pointForm: { id: string | null; name: string; type: MeetingPointType; neighborhoodId: string; lat: number | null; lng: number | null } =
    { id: null, name: '', type: 'park', neighborhoodId: '', lat: null, lng: null };
  savingPoint = false;
  newNeighborhood = { name: '', city: '' };

  readonly meetingPointTypes: { value: MeetingPointType; label: string }[] = [
    { value: 'park', label: 'Parc public' },
    { value: 'daycare', label: 'Crèche / école' },
    { value: 'town_hall', label: 'Mairie / espace public' },
  ];

  private map?: L.Map;
  private layers = {
    me: L.layerGroup(),
    radius: L.layerGroup(),
    events: L.layerGroup(),
    listings: L.layerGroup(),
    points: L.layerGroup(),
    neighborhoods: L.layerGroup(),
    picking: L.layerGroup(),
  };
  private subs = new Subscription();

  constructor(
    private geo: GeoService,
    private geocoding: GeocodingService,
    private http: HttpClient,
    private toast: ToastService,
    public authService: AuthService
  ) {
    this.isAdmin = authService.hasRole('ADMIN');
  }

  ngOnInit(): void {
    this.subs.add(this.geo.circles$.subscribe(c => (this.trustCircles = c)));
    this.subs.add(this.geo.myVerification$.subscribe(v => (this.myVerification = v)));

    this.geo.getMyLocation().subscribe({
      next: loc => {
        this.locationLoading = false;
        this.currentLocation = loc;
        if (loc?.location) {
          const [lng, lat] = loc.location.coordinates;
          this.searchCenter = { lat, lng, label: 'Ma position approximative' };
          this.drawMe();
          this.findNearby();
        }
      },
      error: err => {
        this.locationLoading = false;
        this.toast.error(this.geo.errorMessage(err, 'Impossible de récupérer votre position.'));
      }
    });

    this.geo.getNeighborhoods().subscribe({
      next: list => {
        this.neighborhoods = list;
        if (!this.pointForm.neighborhoodId && list.length) this.pointForm.neighborhoodId = list[0].id;
        this.drawNeighborhoods();
      },
      error: () => (this.neighborhoods = [])
    });
    this.loadMeetingPoints();
    this.geo.getTrustCircles().subscribe({ error: () => (this.trustCircles = []) });
  }

  ngAfterViewInit(): void {
    if (!this.mapEl) return;
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: true }).setView(DEFAULT_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);
    Object.values(this.layers).forEach(layer => layer.addTo(this.map!));
    this.map.on('click', (e: L.LeafletMouseEvent) => this.onMapClick(e.latlng));
    // La carte est créée dans un conteneur dont la taille finale n'est connue qu'après le rendu
    setTimeout(() => this.map?.invalidateSize(), 200);
    this.drawMe();
    this.drawNeighborhoods();
    this.drawMeetingPoints();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.map?.remove();
  }

  // ================================================================ position
  /** Partage de la position du navigateur, après consentement explicite. */
  shareBrowserLocation(): void {
    if (!navigator.geolocation) {
      this.toast.error('La géolocalisation n\'est pas disponible dans ce navigateur. Recherchez plutôt votre ville.');
      return;
    }
    const consent = window.confirm(
      'Partager votre position approximative ?\n\n' +
      'Le serveur la floute (~200 m) avant de l\'enregistrer : votre adresse exacte n\'est jamais conservée. ' +
      'Vous pourrez la retirer à tout moment.'
    );
    if (!consent) return;
    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      pos => this.saveLocation(pos.coords.longitude, pos.coords.latitude),
      err => {
        this.locating = false;
        this.toast.error(err.code === err.PERMISSION_DENIED
          ? 'Accès à la position refusé par le navigateur. Vous pouvez rechercher votre ville à la place.'
          : 'Position indisponible. Recherchez votre ville à la place.');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  shareSearchedPlace(): void {
    if (!this.searchCenter) return;
    if (!window.confirm(`Enregistrer « ${this.searchCenter.label} » comme position approximative (floutée ~200 m) ?`)) return;
    this.locating = true;
    this.saveLocation(this.searchCenter.lng, this.searchCenter.lat);
  }

  private saveLocation(lng: number, lat: number): void {
    this.geo.updateLocation(lng, lat).subscribe({
      next: loc => {
        this.locating = false;
        this.currentLocation = loc;
        const [blng, blat] = loc.location!.coordinates;
        this.searchCenter = { lat: blat, lng: blng, label: 'Ma position approximative' };
        this.drawMe();
        this.toast.success(loc.neighborhood_id
          ? 'Position enregistrée (floutée ~200 m) : vous êtes rattaché(e) à votre quartier.'
          : 'Position enregistrée (floutée ~200 m).');
        this.findNearby();
      },
      error: err => {
        this.locating = false;
        this.toast.error(this.geo.errorMessage(err, 'Enregistrement de la position impossible.'));
      }
    });
  }

  removeLocation(): void {
    if (!window.confirm('Retirer votre position ? Vous n\'apparaîtrez plus dans les recherches de proximité.')) return;
    this.geo.deleteMyLocation().subscribe({
      next: () => {
        this.currentLocation = null;
        this.layers.me.clearLayers();
        this.toast.success('Position supprimée.');
      },
      error: err => this.toast.error(this.geo.errorMessage(err, 'Suppression impossible.'))
    });
  }

  get myNeighborhoodName(): string | null {
    const id = this.currentLocation?.neighborhood_id;
    return id ? this.neighborhoods.find(n => n.id === id)?.name ?? null : null;
  }

  // ================================================================ ville
  searchCity(): void {
    if (this.cityQuery.trim().length < 2) return;
    this.searchingCity = true;
    this.geocoding.search(this.cityQuery).subscribe(results => {
      this.searchingCity = false;
      this.cityResults = results;
      if (!results.length) this.toast.info('Aucun lieu trouvé (ou service de recherche OpenStreetMap injoignable).');
    });
  }

  chooseCity(place: GeocodedPlace): void {
    this.cityResults = [];
    this.searchCenter = { lat: place.lat, lng: place.lng, label: place.label.split(',').slice(0, 2).join(',') };
    this.findNearby();
  }

  // ================================================================ à proximité
  setRadius(km: number): void {
    this.radiusKm = km;
    if (this.searchCenter) this.findNearby();
  }

  findNearby(): void {
    const c = this.searchCenter;
    if (!c) {
      this.toast.info('Partagez votre position ou recherchez une ville pour trouver les services à proximité.');
      return;
    }
    this.searching = true;
    const radiusM = this.radiusKm * 1000;
    const api = environment.apiBaseUrl;
    const events$ = this.http.get<{ content: any[] }>(`${api}/api/events`, {
      params: new HttpParams().set('lat', c.lat).set('lng', c.lng).set('radiusKm', this.radiusKm).set('size', 50),
    }).pipe(map(page => page.content ?? []), catchError(() => of(null)));
    const listings$ = this.http.get<{ listings: any[] }>(`${api}/api/listings`, {
      params: new HttpParams().set('lat', c.lat).set('lng', c.lng).set('radiusKm', this.radiusKm).set('limit', 50),
    }).pipe(map(res => res.listings ?? []), catchError(() => of(null)));
    const parents$ = this.currentLocation
      ? this.geo.getNearbyParents(c.lng, c.lat, radiusM).pipe(catchError(() => of(null)))
      : of([] as NearbyParent[]);

    forkJoin({ events: events$, listings: listings$, parents: parents$ }).subscribe(res => {
      this.searching = false;
      this.hasSearched = true;
      if (res.events === null || res.listings === null || res.parents === null) {
        this.toast.warning('Certains services n\'ont pas répondu : les résultats peuvent être incomplets.');
      }
      this.nearbyEvents = (res.events ?? [])
        .filter(e => e.latitude != null && e.longitude != null)
        .map(e => this.item('event', e.id, e.title,
          `${new Date(e.startDateTime).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${e.city}`,
          e.latitude, e.longitude, `/app/events/${e.id}`))
        .sort((a, b) => a.distanceKm - b.distanceKm);
      this.nearbyListings = (res.listings ?? [])
        .filter(l => Array.isArray(l.location?.coordinates) && l.location.coordinates.length === 2)
        .map(l => this.item('listing', l._id || l.id, l.title,
          [l.location?.neighborhood, l.location?.city].filter(Boolean).join(', ') || 'Marketplace',
          l.location.coordinates[1], l.location.coordinates[0], `/app/marketplace/${l._id || l.id}`))
        .sort((a, b) => a.distanceKm - b.distanceKm);
      this.nearbyParents = (res.parents ?? []).filter(p => p.user_id !== this.authService.currentUser?.id);
      this.nearbyMeetingPoints = this.meetingPoints
        .filter(p => this.distanceKm(c.lat, c.lng, p.location.coordinates[1], p.location.coordinates[0]) <= this.radiusKm);
      this.drawNearby();
    });
  }

  private item(kind: 'event' | 'listing', id: string, title: string, subtitle: string, lat: number, lng: number, link: string): NearbyItem {
    const c = this.searchCenter!;
    return { id, kind, title, subtitle, lat, lng, link, distanceKm: this.distanceKm(c.lat, c.lng, lat, lng) };
  }

  /** Distance orthodromique (formule de Haversine), en km. */
  distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  formatKm(km: number): string {
    return km < 1 ? `${Math.max(100, Math.round(km * 10) * 100)} m` : `${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
  }

  focus(lat: number, lng: number): void {
    this.map?.setView([lat, lng], 15);
  }

  // ================================================================ points de rencontre
  loadMeetingPoints(): void {
    this.geo.getMeetingPoints().subscribe({
      next: points => {
        this.meetingPoints = points;
        this.drawMeetingPoints();
      },
      error: () => (this.meetingPoints = [])
    });
  }

  neighborhoodName(id: string): string {
    return this.neighborhoods.find(n => n.id === id)?.name ?? 'Quartier';
  }

  startPicking(point?: MeetingPoint): void {
    this.activeTab = 'meeting-points';
    if (point) {
      this.pointForm = {
        id: point.id, name: point.name, type: point.type, neighborhoodId: point.neighborhood_id,
        lat: point.location.coordinates[1], lng: point.location.coordinates[0],
      };
      this.drawPicking();
      this.focus(this.pointForm.lat!, this.pointForm.lng!);
    } else {
      this.pointForm = { id: null, name: '', type: 'park', neighborhoodId: this.neighborhoods[0]?.id ?? '', lat: null, lng: null };
      this.layers.picking.clearLayers();
    }
    this.pickingPoint = true;
    this.toast.info('Cliquez sur la carte pour placer le point de rencontre.');
  }

  cancelPicking(): void {
    this.pickingPoint = false;
    this.layers.picking.clearLayers();
  }

  private onMapClick(latlng: L.LatLng): void {
    if (!this.pickingPoint) return;
    this.pointForm.lat = Number(latlng.lat.toFixed(5));
    this.pointForm.lng = Number(latlng.lng.toFixed(5));
    this.drawPicking();
  }

  savePoint(): void {
    const f = this.pointForm;
    if (f.name.trim().length < 2 || !f.neighborhoodId || f.lat === null || f.lng === null) {
      this.toast.warning('Nom (2 caractères minimum), quartier et emplacement sur la carte sont obligatoires.');
      return;
    }
    this.savingPoint = true;
    const body = {
      neighborhood_id: f.neighborhoodId, name: f.name.trim(), type: f.type,
      location: { type: 'Point' as const, coordinates: [f.lng, f.lat] as [number, number] },
    };
    const call$ = f.id ? this.geo.updateMeetingPoint(f.id, body) : this.geo.createMeetingPoint(body);
    call$.subscribe({
      next: () => {
        this.savingPoint = false;
        this.cancelPicking();
        this.toast.success(f.id ? 'Point de rencontre modifié.' : 'Point de rencontre ajouté.');
        this.loadMeetingPoints();
      },
      error: err => {
        this.savingPoint = false;
        this.toast.error(this.geo.errorMessage(err, 'Enregistrement impossible.'));
      }
    });
  }

  deletePoint(point: MeetingPoint): void {
    if (!window.confirm(`Supprimer le point de rencontre « ${point.name} » ?`)) return;
    this.geo.deleteMeetingPoint(point.id).subscribe({
      next: () => {
        this.meetingPoints = this.meetingPoints.filter(p => p.id !== point.id);
        this.nearbyMeetingPoints = this.nearbyMeetingPoints.filter(p => p.id !== point.id);
        this.drawMeetingPoints();
        this.toast.success('Point de rencontre supprimé.');
      },
      error: err => this.toast.error(this.geo.errorMessage(err, 'Suppression impossible.'))
    });
  }

  /** ADMIN : quartier carré d'environ 2 km de côté autour du centre de recherche. */
  createNeighborhoodHere(): void {
    const c = this.searchCenter;
    if (!c) {
      this.toast.warning('Choisissez d\'abord un centre (ville ou position).');
      return;
    }
    if (this.newNeighborhood.name.trim().length < 2 || this.newNeighborhood.city.trim().length < 2) {
      this.toast.warning('Nom et ville du quartier obligatoires.');
      return;
    }
    const dLat = 0.009;
    const dLng = 0.009 / Math.cos((c.lat * Math.PI) / 180);
    const ring: number[][] = [
      [c.lng - dLng, c.lat - dLat], [c.lng + dLng, c.lat - dLat], [c.lng + dLng, c.lat + dLat],
      [c.lng - dLng, c.lat + dLat], [c.lng - dLng, c.lat - dLat],
    ].map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]);
    this.geo.createNeighborhood({
      name: this.newNeighborhood.name.trim(), city: this.newNeighborhood.city.trim(),
      center: { type: 'Point', coordinates: [c.lng, c.lat] },
      boundary: { type: 'Polygon', coordinates: [ring] },
    }).subscribe({
      next: nh => {
        this.neighborhoods = [...this.neighborhoods, nh];
        this.newNeighborhood = { name: '', city: '' };
        this.drawNeighborhoods();
        this.toast.success(`Quartier « ${nh.name} » créé.`);
      },
      error: err => this.toast.error(this.geo.errorMessage(err, 'Création du quartier impossible.'))
    });
  }

  deleteNeighborhood(nh: Neighborhood): void {
    if (!window.confirm(`Supprimer le quartier « ${nh.name} » et ses points de rencontre ?`)) return;
    this.geo.deleteNeighborhood(nh.id).subscribe({
      next: () => {
        this.neighborhoods = this.neighborhoods.filter(n => n.id !== nh.id);
        this.meetingPoints = this.meetingPoints.filter(p => p.neighborhood_id !== nh.id);
        this.drawNeighborhoods();
        this.drawMeetingPoints();
        this.toast.success('Quartier supprimé.');
      },
      error: err => this.toast.error(this.geo.errorMessage(err, 'Suppression impossible.'))
    });
  }

  // ================================================================ cercles de confiance
  getCircle(level: CircleLevel): TrustCircle | undefined {
    return this.trustCircles.find(c => c.level === level);
  }

  addToCircle(parent: NearbyParent, level: CircleLevel): void {
    const members = [...(this.getCircle(level)?.members ?? [])];
    if (members.includes(parent.user_id)) {
      this.toast.info('Ce parent fait déjà partie de ce cercle.');
      return;
    }
    members.push(parent.user_id);
    this.geo.saveTrustCircle(level, members).subscribe({
      next: () => {
        parent.trustLevel = level;
        this.toast.success(`Ajouté à votre cercle ${level === 'close' ? 'proche' : 'quartier'}.`);
      },
      error: err => this.toast.error(this.geo.errorMessage(err, 'Ajout impossible.'))
    });
  }

  removeFromCircle(level: CircleLevel, member: string): void {
    const members = (this.getCircle(level)?.members ?? []).filter(m => m !== member);
    this.geo.saveTrustCircle(level, members).subscribe({
      next: () => this.toast.info('Membre retiré du cercle.'),
      error: err => this.toast.error(this.geo.errorMessage(err, 'Modification impossible.'))
    });
  }

  memberLabel(id: string): string {
    return `Parent n°${id.substring(0, 4).toUpperCase()}`;
  }

  // ================================================================ vérification
  requestVerification(): void {
    this.geo.requestAddressVerification('neighbor_validation').subscribe({
      next: () => this.toast.success('Demande de vérification envoyée aux voisins de votre quartier.'),
      error: err => this.toast.error(this.geo.errorMessage(err, 'Demande impossible (une position dans un quartier est nécessaire).'))
    });
  }

  // ================================================================ carte
  private drawMe(): void {
    if (!this.map) return;
    this.layers.me.clearLayers();
    const loc = this.currentLocation?.location;
    if (!loc) return;
    const [lng, lat] = loc.coordinates;
    L.circle([lat, lng], { radius: this.currentLocation?.precision_m ?? 200, color: '#4f46e5', fillOpacity: 0.15, weight: 2 })
      .bindPopup(this.popup('Ma position approximative', 'Floutée par le serveur (~200 m)'))
      .addTo(this.layers.me);
    if (!this.hasSearched) this.map.setView([lat, lng], 13);
  }

  private drawNearby(): void {
    if (!this.map || !this.searchCenter) return;
    const c = this.searchCenter;
    this.layers.radius.clearLayers();
    this.layers.events.clearLayers();
    this.layers.listings.clearLayers();
    const zone = L.circle([c.lat, c.lng], { radius: this.radiusKm * 1000, color: '#64748b', weight: 1, dashArray: '6 6', fillOpacity: 0.04 })
      .addTo(this.layers.radius);
    for (const e of this.nearbyEvents) {
      L.circleMarker([e.lat, e.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 0.95 })
        .bindPopup(this.popup(`Événement · ${e.title}`, e.subtitle, e.link)).addTo(this.layers.events);
    }
    for (const l of this.nearbyListings) {
      L.circleMarker([l.lat, l.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 0.95 })
        .bindPopup(this.popup(`Annonce · ${l.title}`, l.subtitle, l.link)).addTo(this.layers.listings);
    }
    this.map.fitBounds(zone.getBounds(), { padding: [20, 20] });
  }

  private drawMeetingPoints(): void {
    if (!this.map) return;
    this.layers.points.clearLayers();
    for (const p of this.meetingPoints) {
      const [lng, lat] = p.location.coordinates;
      L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#ea580c', fillOpacity: 0.95 })
        .bindPopup(this.popup(`Point de rencontre · ${p.name}`, `${this.typeLabel(p.type)} · ${this.neighborhoodName(p.neighborhood_id)}`))
        .addTo(this.layers.points);
    }
  }

  private drawNeighborhoods(): void {
    if (!this.map) return;
    this.layers.neighborhoods.clearLayers();
    for (const nh of this.neighborhoods) {
      const ring = nh.boundary?.coordinates?.[0];
      if (!ring) continue;
      L.polygon(ring.map(([lng, lat]) => [lat, lng] as [number, number]), { color: '#a855f7', weight: 1, fillOpacity: 0.05 })
        .bindPopup(this.popup(`Quartier · ${nh.name}`, nh.city)).addTo(this.layers.neighborhoods);
    }
  }

  private drawPicking(): void {
    this.layers.picking.clearLayers();
    if (this.pointForm.lat === null || this.pointForm.lng === null) return;
    L.circleMarker([this.pointForm.lat, this.pointForm.lng], { radius: 11, color: '#ea580c', weight: 3, fillOpacity: 0.2 })
      .addTo(this.layers.picking);
  }

  /** Contenu de bulle construit avec textContent : aucun texte saisi par un utilisateur n'est interprété en HTML. */
  private popup(title: string, subtitle: string, link?: string): HTMLElement {
    const box = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = title;
    const p = document.createElement('div');
    p.textContent = subtitle;
    box.append(strong, p);
    if (link) {
      const a = document.createElement('a');
      a.href = link;
      a.textContent = 'Voir le détail';
      box.append(a);
    }
    return box;
  }

  typeLabel(type: MeetingPointType): string {
    return this.meetingPointTypes.find(t => t.value === type)?.label ?? 'Lieu sûr';
  }

  typeIcon(type: MeetingPointType): string {
    return type === 'park' ? 'park' : type === 'daycare' ? 'child_care' : 'account_balance';
  }
}
