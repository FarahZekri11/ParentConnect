import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BabysittingService } from '../../services/babysitting.service';
import { BabysitterProfile, Availability } from '../../../../shared/models';

interface DaySchedule {
  dayNumber: number;
  dayName: string;
  isAvailable: boolean;
  timeSlot?: string;
}

@Component({
  selector: 'app-babysitter-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './babysitter-profile.component.html',
  styleUrls: ['./babysitter-profile.component.scss']
})
export class BabysitterProfileComponent implements OnInit {
  babysitter: BabysitterProfile | null = null;
  loading = true;
  weekSchedule: DaySchedule[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private babysittingService: BabysittingService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadProfile(id);
      }
    });
  }

  loadProfile(id: string): void {
    this.loading = true;
    this.babysittingService.getBabysitterById(id).subscribe({
      next: (data) => {
        if (data) {
          this.babysitter = data;
          this.computeWeekSchedule(data.availabilities);
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  computeWeekSchedule(availabilities: Availability[]): void {
    const daysConfig = [
      { num: 1, name: 'Lundi' },
      { num: 2, name: 'Mardi' },
      { num: 3, name: 'Mercredi' },
      { num: 4, name: 'Jeudi' },
      { num: 5, name: 'Vendredi' },
      { num: 6, name: 'Samedi' },
      { num: 0, name: 'Dimanche' }
    ];

    this.weekSchedule = daysConfig.map(d => {
      const slot = availabilities.find(a => a.dayOfWeek === d.num);
      return {
        dayNumber: d.num,
        dayName: d.name,
        isAvailable: !!slot,
        timeSlot: slot ? `${slot.startTime} - ${slot.endTime}` : undefined
      };
    });
  }

  requestBooking(): void {
    if (this.babysitter) {
      this.router.navigate(['/app/babysitting/new-request'], {
        queryParams: { babysitterId: this.babysitter.id }
      });
    }
  }

  getInitials(firstName: string, lastName: string): string {
    return ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase();
  }
}
