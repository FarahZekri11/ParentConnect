import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BabysittingService } from '../../services/babysitting.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { BabysittingBooking, BabysittingRequestStatus } from '../../../../shared/models';

type FilterTab = 'ALL' | 'PENDING' | 'ACCEPTED' | 'COMPLETED';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.scss']
})
export class MyBookingsComponent implements OnInit {
  bookings: BabysittingBooking[] = [];
  loading = true;
  activeFilter: FilterTab = 'ALL';

  constructor(
    private babysittingService: BabysittingService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loadBookings();
  }

  loadBookings(): void {
    this.loading = true;
    this.babysittingService.getMyBookings().subscribe({
      next: (data) => {
        this.bookings = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  setFilter(tab: FilterTab): void {
    this.activeFilter = tab;
  }

  get filteredBookings(): BabysittingBooking[] {
    if (this.activeFilter === 'ALL') {
      return this.bookings;
    }
    return this.bookings.filter(b => b.status === this.activeFilter);
  }

  getStatusBadgeClass(status: BabysittingRequestStatus): string {
    switch (status) {
      case 'ACCEPTED':
        return 'badge-success';
      case 'PENDING':
        return 'badge-warning';
      case 'COMPLETED':
        return 'badge-neutral';
      case 'CANCELLED':
      case 'REJECTED':
        return 'badge-error';
      default:
        return 'badge-neutral';
    }
  }

  getStatusLabel(status: BabysittingRequestStatus): string {
    switch (status) {
      case 'ACCEPTED':
        return 'Confirmée';
      case 'PENDING':
        return 'En attente';
      case 'COMPLETED':
        return 'Terminée';
      case 'CANCELLED':
        return 'Annulée';
      case 'REJECTED':
        return 'Refusée';
      default:
        return status;
    }
  }

  cancelBooking(booking: BabysittingBooking): void {
    if (confirm(`Êtes-vous sûr de vouloir annuler la réservation avec ${booking.babysitterName} ?`)) {
      this.babysittingService.cancelBooking(booking.id).subscribe({
        next: () => {
          this.toastService.info('La réservation a été annulée.');
          this.loadBookings();
        }
      });
    }
  }
}
