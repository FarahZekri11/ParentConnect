import { Component, ElementRef, ViewChild, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements AfterViewInit {
  @ViewChild('authVideo') videoRef!: ElementRef<HTMLVideoElement>;
  form: FormGroup;
  loading = false;

  ngAfterViewInit() {
    if (this.videoRef?.nativeElement) {
      const v = this.videoRef.nativeElement;
      v.muted = true;
      v.volume = 0;
      v.defaultMuted = true;
    }
  }

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toast: ToastService
  ) {
    this.form = this.fb.group({
      // Rôle choisi à l'inscription : Parent ou Babysitter (le rôle Administrateur ne s'obtient jamais ici)
      role:        ['PARENT', Validators.required],
      firstName:   ['', Validators.required],
      lastName:    ['', Validators.required],
      email:       ['', [Validators.required, Validators.email]],
      password:    ['', [Validators.required, Validators.minLength(8)]],
      city:        [''],
      postalCode:  [''],
      acceptTerms: [false, Validators.requiredTrue]
    });
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.authService.register(this.form.value).subscribe({
      next: (resp) => {
        this.toast.success('Bienvenue sur ParentConnect, ' + resp.user.firstName + ' ! Votre compte parent est créé.');
        this.router.navigate(['/app/family'], { replaceUrl: true });
      },
      error: (err) => {
        this.loading = false;
        // Message de la Gateway (e-mail déjà utilisé, mot de passe trop court...) ou message générique
        const message = err?.error?.message
          || (err?.status === 0 ? 'Service d\'inscription indisponible. Vérifiez que la plateforme est démarrée.' : null)
          || 'Inscription impossible pour le moment.';
        this.toast.error(message);
      },
      complete: () => this.loading = false
    });
  }
}
