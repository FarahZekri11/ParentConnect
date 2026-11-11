import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { User } from '../../shared/models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  profileForm!: FormGroup;
  isSaving = false;
  private subs = new Subscription();

  constructor(
    private authService: AuthService,
    private toastService: ToastService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initForm();

    // Subscribe to current user
    this.subs.add(
      this.authService.currentUser$.subscribe(user => {
        if (user) {
          this.currentUser = user;
          this.populateForm(user);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private initForm(): void {
    this.profileForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(/^[+0-9\s.-]{8,18}$/)]],
      city: ['', [Validators.required]],
      postalCode: ['', [Validators.required, Validators.pattern(/^[0-9]{4,5}$/)]],
      neighborhood: [''],
      bio: ['', [Validators.maxLength(500)]]
    });
  }

  private populateForm(user: User): void {
    this.profileForm.patchValue({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phone || '',
      city: user.city || '',
      postalCode: user.postalCode || '',
      neighborhood: user.neighborhood || '',
      bio: user.bio || ''
    });
  }

  onSubmit(): void {
    if (this.profileForm.invalid || this.isSaving) {
      this.profileForm.markAllAsTouched();
      this.toastService.warning('Veuillez vérifier les champs du formulaire.');
      return;
    }

    this.isSaving = true;
    const formVal = this.profileForm.value;

    const updatedUser: Partial<User> = {
      firstName: formVal.firstName.trim(),
      lastName: formVal.lastName.trim(),
      email: formVal.email.trim(),
      phone: formVal.phone ? formVal.phone.trim() : undefined,
      city: formVal.city ? formVal.city.trim() : undefined,
      postalCode: formVal.postalCode ? formVal.postalCode.trim() : undefined,
      neighborhood: formVal.neighborhood ? formVal.neighborhood.trim() : undefined,
      bio: formVal.bio ? formVal.bio.trim() : undefined
    };

    this.authService.updateProfile(updatedUser).subscribe({
      next: (user) => {
        this.currentUser = user;
        this.isSaving = false;
        this.toastService.success('Votre profil a été mis à jour avec succès !');
      },
      error: () => {
        this.isSaving = false;
        this.toastService.error('Erreur lors de la mise à jour du profil.');
      }
    });
  }

  getInitials(): string {
    if (!this.currentUser) return '?';
    const first = this.currentUser.firstName ? this.currentUser.firstName[0] : '';
    const last = this.currentUser.lastName ? this.currentUser.lastName[0] : '';
    return (first + last).toUpperCase() || '?';
  }

  formatJoinedDate(date: Date | string | undefined): string {
    if (!date) return 'Récemment';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    });
  }
}
