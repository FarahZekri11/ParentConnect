import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, ReactiveFormsModule, FormBuilder, FormGroup, ValidationErrors, Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EVENT_CATEGORIES, EventFormValue, EventsService } from '../../services/events.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { EventCategory } from '../../../../shared/models';

/** Fin après le début, date de début dans le futur, âge minimum ≤ âge maximum. */
function eventConsistencyValidator(group: AbstractControl): ValidationErrors | null {
  const { date, startTime, endTime, minChildAge, maxChildAge } = group.value;
  const errors: ValidationErrors = {};
  if (startTime && endTime && endTime <= startTime) errors['endBeforeStart'] = true;
  if (date && startTime && new Date(`${date}T${startTime}:00`).getTime() <= Date.now()) errors['startInPast'] = true;
  const min = minChildAge === '' || minChildAge === null ? null : Number(minChildAge);
  const max = maxChildAge === '' || maxChildAge === null ? null : Number(maxChildAge);
  if (min !== null && max !== null && min > max) errors['ageRange'] = true;
  return Object.keys(errors).length ? errors : null;
}

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-create-event',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './create-event.component.html',
  styleUrls: ['./create-event.component.scss']
})
export class CreateEventComponent implements OnInit {
  eventForm!: FormGroup;
  isSubmitting = false;
  isLoading = false;
  /** Identifiant de l'événement modifié (mode modification), sinon null (création). */
  editId: string | null = null;

  readonly categoryOptions = EVENT_CATEGORIES;

  constructor(
    private fb: FormBuilder,
    private eventsService: EventsService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  get isEdit(): boolean {
    return this.editId !== null;
  }

  ngOnInit(): void {
    // Création et modification réservées aux administrateurs (contrôle aussi fait par le backend)
    if (!this.eventsService.isAdmin()) {
      this.toastService.warning('Seuls les administrateurs peuvent organiser des événements.');
      this.router.navigate(['/app/events']);
      return;
    }

    const inTwoDays = new Date();
    inTwoDays.setDate(inTwoDays.getDate() + 2);
    const dateStr = `${inTwoDays.getFullYear()}-${String(inTwoDays.getMonth() + 1).padStart(2, '0')}-${String(inTwoDays.getDate()).padStart(2, '0')}`;

    this.eventForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(150)]],
      category: ['ATELIER' as EventCategory, [Validators.required]],
      description: ['', [Validators.maxLength(5000)]],
      date: [dateStr, [Validators.required]],
      startTime: ['10:00', [Validators.required]],
      endTime: ['11:30', [Validators.required]],
      locationName: ['', [Validators.maxLength(150)]],
      address: ['', [Validators.maxLength(255)]],
      city: ['Paris', [Validators.required, Validators.maxLength(100)]],
      capacity: [12, [Validators.required, Validators.min(1), Validators.max(10000)]],
      minChildAge: [null as number | null, [Validators.min(0), Validators.max(18)]],
      maxChildAge: [null as number | null, [Validators.min(0), Validators.max(18)]],
    }, { validators: eventConsistencyValidator });

    this.editId = this.route.snapshot.paramMap.get('id');
    if (this.editId) {
      this.isLoading = true;
      this.eventsService.getEventById(this.editId).subscribe({
        next: evt => {
          this.isLoading = false;
          if (!evt) {
            this.toastService.error('Événement introuvable.');
            this.router.navigate(['/app/events']);
            return;
          }
          this.eventForm.patchValue(this.eventsService.toFormValue(evt));
        },
        error: err => {
          this.isLoading = false;
          this.toastService.error(this.eventsService.errorMessage(err, 'Erreur lors du chargement de l\'événement.'));
        }
      });
    }
  }

  selectCategory(category: EventCategory): void {
    this.eventForm.patchValue({ category });
  }

  hasFormError(error: string): boolean {
    return !!this.eventForm.errors?.[error] && (this.eventForm.touched || this.eventForm.dirty);
  }

  onSubmit(): void {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      this.toastService.warning('Veuillez corriger les champs signalés.');
      return;
    }

    this.isSubmitting = true;
    const value = this.eventForm.value as EventFormValue;
    const request$ = this.editId
      ? this.eventsService.updateEvent(this.editId, value)
      : this.eventsService.createEvent(value);

    request$.subscribe({
      next: saved => {
        this.isSubmitting = false;
        this.toastService.success(this.isEdit
          ? `L'événement "${saved.title}" a été modifié. Les participants sont prévenus.`
          : `L'événement "${saved.title}" a été publié !`);
        this.router.navigate(['/app/events', saved.id]);
      },
      error: err => {
        this.isSubmitting = false;
        this.toastService.error(this.eventsService.errorMessage(err,
          this.isEdit ? 'Erreur lors de la modification.' : 'Erreur lors de la création de l\'événement.'));
      }
    });
  }
}
