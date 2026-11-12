import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AGE_RANGES, BabysittingService, SittingRequest, SitterMatch } from '../../services/babysitting.service';
import { ToastService } from '../../../../shared/services/toast.service';

/** Fin après le début ; date du jour ou future. */
function requestValidator(group: AbstractControl): ValidationErrors | null {
  const { date, startTime, endTime } = group.value;
  const errors: ValidationErrors = {};
  if (startTime && endTime && endTime <= startTime) errors['endBeforeStart'] = true;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date && date < todayStr) errors['pastDate'] = true;
  return Object.keys(errors).length ? errors : null;
}

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-new-request',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './new-request.component.html',
  styleUrls: ['./new-request.component.scss']
})
export class NewRequestComponent implements OnInit {
  form!: FormGroup;
  submitting = false;
  readonly ageRanges = AGE_RANGES;

  /** Après publication : la demande et les parents disponibles compatibles (matching du service). */
  created: SittingRequest | null = null;
  matches: SitterMatch[] = [];
  loadingMatches = false;

  /** Mode modification (/app/babysitting/edit/:id) */
  editId: string | null = null;
  loadingRequest = false;

  constructor(
    private fb: FormBuilder,
    private babysittingService: BabysittingService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.form = this.fb.group({
      date: [date, Validators.required],
      startTime: ['18:00', Validators.required],
      endTime: ['20:00', Validators.required],
      neighborhood: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      children: this.fb.array([this.fb.control('3-6', Validators.required)]),
      notes: ['', Validators.maxLength(500)],
    }, { validators: requestValidator });

    this.editId = this.route.snapshot.paramMap.get('id');
    if (this.editId) this.loadForEdit(this.editId);
  }

  private loadForEdit(id: string): void {
    this.loadingRequest = true;
    this.babysittingService.getRequest(id).subscribe({
      next: req => {
        this.loadingRequest = false;
        if (req.status !== 'OPEN') {
          this.toast.warning('Cette demande n\'est plus modifiable (une garde est déjà prévue).');
          this.router.navigate(['/app/babysitting']);
          return;
        }
        this.children.clear();
        (req.childAgeRanges.length ? req.childAgeRanges : ['3-6'])
          .forEach(a => this.children.push(this.fb.control(a, Validators.required)));
        this.form.patchValue({
          date: req.date, startTime: req.startTime, endTime: req.endTime,
          neighborhood: req.neighborhood, notes: req.notes ?? '',
        });
      },
      error: err => {
        this.loadingRequest = false;
        this.toast.error(this.babysittingService.errorMessage(err, 'Demande introuvable.'));
        this.router.navigate(['/app/babysitting']);
      }
    });
  }

  get children(): FormArray {
    return this.form.get('children') as FormArray;
  }

  get hours(): number {
    const { startTime, endTime } = this.form.value;
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  }

  addChild(): void {
    if (this.children.length < 10) this.children.push(this.fb.control('3-6', Validators.required));
  }

  removeChild(index: number): void {
    if (this.children.length > 1) this.children.removeAt(index);
  }

  hasError(name: string): boolean {
    return !!this.form.errors?.[name];
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warning('Vérifiez les champs signalés.');
      return;
    }
    this.submitting = true;
    const v = this.form.value;
    const payload = {
      date: v.date, startTime: v.startTime, endTime: v.endTime,
      neighborhood: v.neighborhood, childAgeRanges: v.children, notes: v.notes,
    };
    if (this.editId) {
      this.babysittingService.updateRequest(this.editId, payload).subscribe({
        next: () => {
          this.submitting = false;
          this.toast.success('Demande modifiée.');
          this.router.navigate(['/app/babysitting']);
        },
        error: err => {
          this.submitting = false;
          this.toast.error(this.babysittingService.errorMessage(err, 'Modification impossible.'));
        }
      });
      return;
    }
    this.babysittingService.createRequest(payload).subscribe({
      next: req => {
        this.submitting = false;
        this.created = req;
        this.toast.success('Demande publiée ! Les babysitters du quartier peuvent vous proposer leur aide.');
        this.loadMatches(req.id);
      },
      error: err => {
        this.submitting = false;
        this.toast.error(this.babysittingService.errorMessage(err, 'Impossible de publier la demande.'));
      }
    });
  }

  private loadMatches(requestId: string): void {
    this.loadingMatches = true;
    this.babysittingService.getMatches(requestId).subscribe({
      next: matches => {
        this.matches = matches;
        this.loadingMatches = false;
      },
      error: () => {
        this.matches = [];
        this.loadingMatches = false;
      }
    });
  }
}
