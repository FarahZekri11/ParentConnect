import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
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
        this.authService.setUser(resp.user, resp.accessToken);
        this.toast.success('Bienvenue sur ParentConnect, ' + resp.user.firstName + ' !');
        this.router.navigate(['/app/dashboard'], { replaceUrl: true });
      },
      error: () => { this.loading = false; this.toast.error('Une erreur est survenue.'); },
      complete: () => this.loading = false
    });
  }
}
