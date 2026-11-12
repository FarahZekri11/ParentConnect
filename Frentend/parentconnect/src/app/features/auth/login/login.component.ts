import { Component, ElementRef, ViewChild, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements AfterViewInit {
  @ViewChild('authVideo') videoRef!: ElementRef<HTMLVideoElement>;
  form: FormGroup;
  loading = false;
  showPassword = false;

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
    private route: ActivatedRoute,
    private toast: ToastService
  ) {
    this.form = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  get email()    { return this.form.get('email'); }
  get password() { return this.form.get('password'); }

  /** Comptes de démonstration du realm Keycloak (mot de passe = KC_DEMO_PASSWORD du .env) */
  // Mot de passe administrateur : jamais dans le code (KC_APP_ADMIN_PASSWORD du .env, à saisir).
  readonly demoAccounts = [
    { label: 'Administrateur', icon: 'admin_panel_settings', email: 'admin@parentconnect.local', admin: true },
    { label: 'Parent (Marie)', icon: 'family_restroom', email: 'marie.l@email.com', admin: false },
    { label: 'Parent (Paul)', icon: 'escalator_warning', email: 'paul.d@email.com', admin: false },
    { label: 'Babysitter (Nadia)', icon: 'child_care', email: 'nadia.k@email.com', admin: false },
  ];
  /** Mot de passe partagé des comptes de démonstration NON administrateurs (KC_DEMO_PASSWORD par défaut). */
  readonly demoPassword = 'ParentConnect2026!';

  fillDemo(account = this.demoAccounts[1]) {
    this.form.patchValue({ email: account.email, password: account.admin ? '' : this.demoPassword });
    this.form.markAsUntouched();
    if (account.admin) {
      this.toast.info('Saisissez le mot de passe administrateur (KC_APP_ADMIN_PASSWORD dans le fichier .env).');
    }
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.authService.login(this.form.value).subscribe({
      next: (resp) => {
        this.authService.setUser(resp.user, resp.accessToken);
        this.toast.success('Bienvenue, ' + resp.user.firstName + ' !');
        const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/app/dashboard';
        this.router.navigateByUrl(returnUrl, { replaceUrl: true });
      },
      error: () => {
        this.loading = false;
        this.toast.error('Email ou mot de passe incorrect.');
      },
      complete: () => this.loading = false
    });
  }
}
