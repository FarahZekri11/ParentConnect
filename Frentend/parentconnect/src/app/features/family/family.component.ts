import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Family, Child } from '../../shared/models';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-family',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './family.component.html',
  styleUrls: ['./family.component.scss']
})
export class FamilyComponent implements OnInit, OnDestroy {
  family: Family | null = null;
  loading = true;
  showAddChildModal = false;
  isSubmitting = false;

  childForm!: FormGroup;
  private subs = new Subscription();

  /** Renommage de la famille */
  editingName = false;
  familyName = '';

  get currentCity(): string {
    const user = this.authService.currentUser;
    return [user?.neighborhood, user?.city].filter(Boolean).join(', ');
  }

  startRename(): void {
    this.familyName = this.family?.name ?? '';
    this.editingName = true;
  }

  saveRename(): void {
    if (!this.familyName.trim()) return;
    this.authService.renameFamily(this.familyName).subscribe(() => {
      this.editingName = false;
      this.toastService.success('Nom de la famille mis à jour.');
    });
  }

  removeChild(child: Child): void {
    if (!window.confirm(`Retirer ${child.firstName} de la famille ?`)) return;
    this.authService.removeChild(child.id).subscribe(() => {
      this.toastService.info(`${child.firstName} a été retiré(e) de la famille.`);
    });
  }

  constructor(
    private authService: AuthService,
    private toastService: ToastService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadFamily();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private initForm(): void {
    this.childForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      birthDate: ['', [Validators.required]],
      gender: ['F', [Validators.required]],
      allergies: [''],
      notes: ['']
    });
  }

  private loadFamily(): void {
    this.loading = true;
    this.subs.add(
      this.authService.getFamily().subscribe({
        next: (fam) => {
          this.family = fam;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      })
    );

    // Also stay reactive if family updates
    this.subs.add(
      this.authService.family$.subscribe((fam) => {
        if (fam) {
          this.family = fam;
        }
      })
    );
  }

  openAddChildModal(): void {
    this.childForm.reset({
      firstName: '',
      birthDate: '',
      gender: 'F',
      allergies: '',
      notes: ''
    });
    this.showAddChildModal = true;
  }

  closeAddChildModal(): void {
    this.showAddChildModal = false;
  }

  submitAddChild(): void {
    if (this.childForm.invalid || this.isSubmitting) {
      this.childForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formVal = this.childForm.value;

    const newChildData: Partial<Child> = {
      firstName: formVal.firstName.trim(),
      birthDate: new Date(formVal.birthDate),
      gender: formVal.gender,
      allergies: formVal.allergies?.trim() || '',
      notes: formVal.notes?.trim() || ''
    };

    this.authService.addChild(newChildData).subscribe({
      next: (child) => {
        this.isSubmitting = false;
        this.showAddChildModal = false;
        this.toastService.success(`${child.firstName} a bien été ajouté(e) à votre famille !`);
      },
      error: () => {
        this.isSubmitting = false;
        this.toastService.error("Impossible d'ajouter l'enfant pour le moment.");
      }
    });
  }

  calculateAge(birthDate: Date | string): string {
    const bDate = new Date(birthDate);
    const now = new Date();

    let years = now.getFullYear() - bDate.getFullYear();
    let months = now.getMonth() - bDate.getMonth();

    if (now.getDate() < bDate.getDate()) {
      months--;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    if (years < 0) {
      return 'À naître bientôt';
    }

    if (years === 0) {
      if (months <= 1) return '1 mois';
      return `${months} mois`;
    }

    if (years === 1) {
      return months > 0 ? `1 an et ${months} mois` : '1 an';
    }

    return months > 0 ? `${years} ans et ${months} m.` : `${years} ans`;
  }

  getChildAvatarBackground(gender?: string): string {
    if (gender === 'F') return 'var(--color-pink)';
    if (gender === 'M') return 'var(--color-blue)';
    return 'var(--color-purple)';
  }

  getChildIcon(gender?: string): string {
    if (gender === 'F') return 'face_3';
    if (gender === 'M') return 'face_6';
    return 'child_care';
  }
}
