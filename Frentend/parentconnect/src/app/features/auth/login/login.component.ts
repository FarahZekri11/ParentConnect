import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
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
      email:    ['farah.zekri@email.com', [Validators.required, Validators.email]],
      password: ['password123',           [Validators.required, Validators.minLength(8)]],
    });
  }

  get email()    { return this.form.get('email'); }
  get password() { return this.form.get('password'); }

  fillDemo() {
    this.form.patchValue({
      email: 'farah.zekri@email.com',
      password: 'password123'
    });
    this.form.markAsUntouched();
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
