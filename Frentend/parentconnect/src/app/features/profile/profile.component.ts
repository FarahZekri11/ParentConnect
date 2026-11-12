import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { User } from '../../shared/models';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
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
      city: [''],
      postalCode: ['', [Validators.pattern(/^[0-9]{4,5}$/)]],
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
      error: (err) => {
        this.isSaving = false;
        this.toastService.error(err?.error?.message || 'Erreur lors de la mise à jour du profil.');
      }
    });
  }

  // ------------------------------------------------------------ mot de passe
  passwordForm = { current: '', next: '', confirm: '' };
  isChangingPassword = false;

  get roleLabel(): string {
    return this.authService.primaryRoleLabel();
  }

  changePassword(): void {
    const f = this.passwordForm;
    if (!f.current || f.next.length < 8) {
      this.toastService.warning('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (f.next !== f.confirm) {
      this.toastService.warning('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    this.isChangingPassword = true;
    this.authService.changePassword(f.current, f.next).subscribe({
      next: () => {
        this.isChangingPassword = false;
        this.passwordForm = { current: '', next: '', confirm: '' };
        this.toastService.success('Mot de passe modifié.');
      },
      error: (err) => {
        this.isChangingPassword = false;
        this.toastService.error(err?.error?.message || 'Impossible de modifier le mot de passe.');
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
