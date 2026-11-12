import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommunityService, MAX_POST_PHOTOS } from '../../services/community.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { PostType, PostCategory } from '../../../../shared/models';

interface TypeOption {
  value: PostType;
  label: string;
  desc: string;
  icon: string;
}

interface CategoryChoice {
  value: PostCategory;
  label: string;
  icon: string;
}

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-create-post',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './create-post.component.html',
  styleUrls: ['./create-post.component.scss']
})
export class CreatePostComponent implements OnInit {
  postForm!: FormGroup;
  isSubmitting = false;

  /** Mode modification (/app/community/edit/:id) */
  editId: string | null = null;
  photos: string[] = [];
  isUploading = false;
  readonly maxPhotos = MAX_POST_PHOTOS;

  /** Deux types côté service Posts : « question » et « post » (partage / conseil). */
  typeOptions: TypeOption[] = [
    {
      value: 'QUESTION',
      label: 'Question',
      desc: 'Besoin d\'un retour d\'expérience ou d\'un éclairage sur une situation ?',
      icon: 'help_outline'
    },
    {
      value: 'ADVICE',
      label: 'Partage & conseil',
      desc: 'Partagez une astuce, une recommandation ou lancez une discussion.',
      icon: 'lightbulb'
    }
  ];

  /** Catégories du service Catégories (chargées depuis l'API). */
  categoryChoices: CategoryChoice[] = [];

  samplePrompts: Record<string, string> = {
    QUESTION: 'Ex : Comment gérer la phase d\'opposition des 2 ans au moment des repas ?',
    ADVICE: 'Ex : Notre routine douce pour endormir bébé en moins de 15 minutes'
  };

  constructor(
    private fb: FormBuilder,
    private communityService: CommunityService,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const initialTypeParam = this.route.snapshot.queryParamMap.get('type') as PostType;
    const initialType: PostType = initialTypeParam === 'ADVICE' ? 'ADVICE' : 'QUESTION';

    this.postForm = this.fb.group({
      type: [initialType, [Validators.required]],
      category: ['' as PostCategory, [Validators.required]],
      // Mêmes règles que le service Posts (titre 5-150, message 10-5000 caractères)
      title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(150)]],
      content: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]]
    });

    this.editId = this.route.snapshot.paramMap.get('id');
    if (this.editId) this.loadForEdit(this.editId);

    this.communityService.getCategories().subscribe({
      next: categories => {
        this.categoryChoices = categories.map(c => ({ value: c.slug, label: c.name, icon: c.icon }));
        if (!this.postForm.get('category')?.value && categories.length) {
          this.postForm.patchValue({ category: categories[0].slug });
        }
      },
      error: () => this.toastService.error('Catégories indisponibles : publication impossible pour le moment.')
    });
  }

  private loadForEdit(id: string): void {
    this.communityService.getPostById(id).subscribe({
      next: post => {
        if (!post || !post.isMine) {
          this.toastService.error('Seul l\'auteur peut modifier cette publication.');
          this.router.navigate(['/app/community']);
          return;
        }
        this.postForm.patchValue({ type: post.type, category: post.category, title: post.title, content: post.content });
        this.photos = [...(post.images ?? [])];
      },
      error: () => {
        this.toastService.error('Publication introuvable.');
        this.router.navigate(['/app/community']);
      }
    });
  }

  onPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = Array.from(input.files ?? []);
    input.value = '';
    const room = this.maxPhotos - this.photos.length;
    if (selected.length > room) this.toastService.warning(`${this.maxPhotos} photos maximum par publication.`);
    const files = selected.slice(0, Math.max(0, room));
    for (const f of files) {
      const problem = this.communityService.validatePhoto(f);
      if (problem) {
        this.toastService.error(problem);
        return;
      }
    }
    if (!files.length) return;
    this.isUploading = true;
    this.communityService.uploadPhotos(files).subscribe({
      next: urls => {
        this.photos = [...this.photos, ...urls];
        this.isUploading = false;
      },
      error: err => {
        this.isUploading = false;
        this.toastService.error(this.communityService.errorMessage(err, 'Envoi de la photo impossible.'));
      }
    });
  }

  removePhoto(index: number): void {
    this.photos = this.photos.filter((_, i) => i !== index);
  }

  get currentType(): PostType {
    return this.postForm.get('type')?.value || 'QUESTION';
  }

  selectType(type: PostType): void {
    this.postForm.patchValue({ type });
  }

  selectCategory(category: PostCategory): void {
    this.postForm.patchValue({ category });
  }

  onSubmit(): void {
    if (this.postForm.invalid) {
      this.postForm.markAllAsTouched();
      this.toastService.warning('Veuillez remplir correctement tous les champs obligatoires.');
      return;
    }

    this.isSubmitting = true;
    const formValues = this.postForm.value;
    const payload = {
      title: formValues.title,
      content: formValues.content,
      type: formValues.type,
      category: formValues.category,
      images: this.photos,
    };

    if (this.editId) {
      const id = this.editId;
      this.communityService.updatePost(id, payload).subscribe({
        next: () => {
          this.isSubmitting = false;
          this.toastService.success('Publication modifiée.');
          this.router.navigate(['/app/community', id]);
        },
        error: err => {
          this.isSubmitting = false;
          this.toastService.error(this.communityService.errorMessage(err, 'Modification impossible.'));
        }
      });
      return;
    }

    this.communityService
      .createPost(payload)
      .subscribe({
        next: createdPost => {
          this.isSubmitting = false;
          this.toastService.success('Votre publication a été partagée dans la communauté !');
          this.router.navigate(['/app/community', createdPost.id]);
        },
        error: err => {
          this.isSubmitting = false;
          this.toastService.error(this.communityService.errorMessage(err, 'Erreur lors de la publication. Veuillez réessayer.'));
        }
      });
  }
}
