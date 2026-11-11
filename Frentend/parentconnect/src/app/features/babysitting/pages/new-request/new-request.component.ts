import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { BabysittingService } from '../../services/babysitting.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { AuthService } from '../../../../core/services/auth.service';
import { BabysitterProfile, Child } from '../../../../shared/models';

@Component({
  selector: 'app-new-request',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './new-request.component.html',
  styleUrls: ['./new-request.component.scss']
})
export class NewRequestComponent implements OnInit {
  requestForm!: FormGroup;
  selectedBabysitter: BabysitterProfile | null = null;
  familyChildren: Child[] = [];
  selectedChildrenNames: string[] = [];
  submitting = false;

  // Defaults
  minDate: string = '';

  constructor(
    private fb: FormBuilder,
    private babysittingService: BabysittingService,
    private toastService: ToastService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Min date = today (YYYY-MM-DD)
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];

    const defaultAddress = this.authService.currentUser?.neighborhood
      ? `14 Rue Oberkampf, 75011 Paris`
      : 'Paris';

    this.requestForm = this.fb.group({
      date: [this.minDate, [Validators.required]],
      startTime: ['18:30', [Validators.required]],
      endTime: ['22:00', [Validators.required]],
      address: [defaultAddress, [Validators.required, Validators.minLength(5)]],
      childrenCount: [1, [Validators.required, Validators.min(1), Validators.max(6)]],
      notes: ['']
    });

    // Load family children if available
    this.authService.family$.subscribe(family => {
      if (family && family.children && family.children.length > 0) {
        this.familyChildren = family.children;
        // Default select first child or all
        this.selectedChildrenNames = [family.children[0].firstName];
        this.requestForm.patchValue({ childrenCount: 1 });
      }
    });

    // Check query params for pre-selected babysitter
    this.route.queryParams.subscribe(params => {
      const bsId = params['babysitterId'];
      if (bsId) {
        this.babysittingService.getBabysitterById(bsId).subscribe(bs => {
          if (bs) {
            this.selectedBabysitter = bs;
          }
        });
      }
    });
  }

  toggleChild(childName: string): void {
    const idx = this.selectedChildrenNames.indexOf(childName);
    if (idx > -1) {
      if (this.selectedChildrenNames.length > 1) {
        this.selectedChildrenNames.splice(idx, 1);
      }
    } else {
      this.selectedChildrenNames.push(childName);
    }
    this.requestForm.patchValue({ childrenCount: this.selectedChildrenNames.length });
  }

  isChildSelected(childName: string): boolean {
    return this.selectedChildrenNames.includes(childName);
  }

  get durationHours(): number {
    const start = this.requestForm.get('startTime')?.value;
    const end = this.requestForm.get('endTime')?.value;
    if (!start || !end) return 0;

    try {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin <= startMin) {
        endMin += 24 * 60; // Next day midnight
      }
      return Math.round(((endMin - startMin) / 60) * 10) / 10;
    } catch {
      return 0;
    }
  }

  get estimatedCost(): number {
    const rate = this.selectedBabysitter ? this.selectedBabysitter.hourlyRate : 15;
    return Math.round(this.durationHours * rate * 10) / 10;
  }

  onSubmit(): void {
    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const formVal = this.requestForm.value;

    const childrenList = this.selectedChildrenNames.length > 0
      ? this.selectedChildrenNames
      : [`${formVal.childrenCount} enfant(s)`];

    const payload = {
      babysitterId: this.selectedBabysitter ? this.selectedBabysitter.id : undefined,
      babysitterName: this.selectedBabysitter ? `${this.selectedBabysitter.firstName} ${this.selectedBabysitter.lastName}` : undefined,
      children: childrenList,
      date: new Date(formVal.date),
      startTime: formVal.startTime,
      endTime: formVal.endTime,
      address: formVal.address,
      notes: formVal.notes
    };

    this.babysittingService.createRequest(payload).subscribe({
      next: () => {
        this.submitting = false;
        this.toastService.success('Votre demande de garde a été transmise avec succès !');
        this.router.navigate(['/app/babysitting/my-bookings']);
      },
      error: () => {
        this.submitting = false;
        this.toastService.error('Une erreur est survenue lors de l\'envoi de votre demande.');
      }
    });
  }
}
