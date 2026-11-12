import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface GeocodedPlace {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Géocodage par OpenStreetMap Nominatim (service public, sans clé).
 * Les coordonnées renvoyées sont arrondies à 3 décimales (~100 m) : ParentConnect ne manipule que des
 * positions approximatives. La politique d'usage de Nominatim limite à ~1 requête/s : les appels ne sont
 * faits qu'à la demande de l'utilisateur (recherche, enregistrement d'un formulaire).
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = 'https://nominatim.openstreetmap.org/search';

  static approx(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  /** Recherche d'une ville / adresse ; liste vide si rien n'est trouvé ou si le service est injoignable. */
  search(query: string, limit = 5): Observable<GeocodedPlace[]> {
    const q = query?.trim();
    if (!q || q.length < 2) return of([]);
    const params = new HttpParams()
      .set('q', q)
      .set('format', 'jsonv2')
      .set('limit', limit)
      .set('accept-language', 'fr');
    return this.http.get<{ display_name: string; lat: string; lon: string }[]>(this.endpoint, { params }).pipe(
      map(rows => rows.map(r => ({
        label: r.display_name,
        lat: GeocodingService.approx(Number(r.lat)),
        lng: GeocodingService.approx(Number(r.lon)),
      }))),
      catchError(() => of([])),
    );
  }

  /** Premier résultat (ou null) : utilisé pour situer approximativement un événement ou une annonce. */
  locate(query: string): Observable<GeocodedPlace | null> {
    return this.search(query, 1).pipe(map(list => list[0] ?? null));
  }
}
