import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BabysittingService, BabysitterFilter } from './services/babysitting.service';
import { BabysitterProfile } from '../../shared/models';

interface DayOption {
  value: number | null;
  label: string;
}

@Component({
  selector: 'app-babysitting',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './babysitting.component.html',
  styleUrls: ['./babysitting.component.scss']
})
export class BabysittingComponent implements OnInit {
  babysitters: BabysitterProfile[] = [];
  loading = true;

  // Filters state
  searchQuery = '';
  selectedNeighborhood = 'ALL';
  selectedDay: number | null = null;
  maxHourlyRate = 20;

  // Options
  neighborhoods: string[] = ['Oberkampf', 'Bastille', 'Nation', 'Belleville', 'Canal Saint-Martin'];
  
  days: DayOption[] = [
    { value: null, label: 'Tous' },
    { value: 1, label: 'Lun' },
    { value: 2, label: 'Mar' },
    { value: 3, label: 'Mer' },
    { value: 4, label: 'Jeu' },
    { value: 5, label: 'Ven' },
    { value: 6, label: 'Sam' },
    { value: 0, label: 'Dim' }
  ];

  constructor(
    private babysittingService: BabysittingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadBabysitters();
  }

  loadBabysitters(): void {
    this.loading = true;
    const filter: BabysitterFilter = {
      search: this.searchQuery,
      neighborhood: this.selectedNeighborhood,
      dayOfWeek: this.selectedDay,
      maxRate: this.maxHourlyRate
    };

    this.babysittingService.getBabysitters(filter).subscribe({
      next: (data) => {
        this.babysitters = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  onFilterChange(): void {
    this.loadBabysitters();
  }

  selectDay(dayValue: number | null): void {
    this.selectedDay = dayValue;
    this.loadBabysitters();
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.selectedNeighborhood = 'ALL';
    this.selectedDay = null;
    this.maxHourlyRate = 20;
    this.loadBabysitters();
  }

  bookBabysitter(babysitter: BabysitterProfile): void {
    this.router.navigate(['/app/babysitting/new-request'], {
      queryParams: { babysitterId: babysitter.id }
    });
  }

  getDayName(dayOfWeek: number): string {
    const names = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return names[dayOfWeek] || '';
  }

  getInitials(firstName: string, lastName: string): string {
    return ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase();
  }
}
