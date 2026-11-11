import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommunityService } from '../../services/community.service';
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
  selector: 'app-create-post',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './create-post.component.html',
  styleUrls: ['./create-post.component.scss']
})
export class CreatePostComponent implements OnInit {
  postForm!: FormGroup;
  isSubmitting = false;

  typeOptions: TypeOption[] = [
    {
      value: 'QUESTION',
      label: 'Question',
      desc: 'Besoin d\'un retour d\'expérience ou d\'un éclairage sur une situation ?',
      icon: 'help_outline'
    },
    {
      value: 'ADVICE',
      label: 'Conseil',
      desc: 'Partagez une astuce ou méthode qui a sauvé vos journées ou vos nuits.',
      icon: 'lightbulb'
    },
    {
      value: 'RECOMMENDATION',
      label: 'Recommandation',
      desc: 'Recommandez un pédiatre, un parc, un livre ou du matériel de puériculture.',
      icon: 'thumb_up'
    },
    {
      value: 'DISCUSSION',
      label: 'Discussion',
      desc: 'Engagez un échange libre avec la communauté sur un sujet parental.',
      icon: 'forum'
    }
  ];

  categoryChoices: CategoryChoice[] = [
    { value: 'HEALTH', label: 'Santé & Soins', icon: 'health_and_safety' },
    { value: 'SLEEP', label: 'Sommeil & Nuits', icon: 'bedtime' },
    { value: 'NUTRITION', label: 'Nutrition & DME', icon: 'restaurant_menu' },
    { value: 'ACTIVITIES', label: 'Éveil & Activités', icon: 'toys' },
    { value: 'GEAR', label: 'Équipement & Matériel', icon: 'stroller' },
    { value: 'EMOTIONS', label: 'Émotions & Frustrations', icon: 'sentiment_satisfied' },
    { value: 'PARENTING', label: 'Parentalité & Couple', icon: 'family_restroom' },
    { value: 'EDUCATION', label: 'Éducation & Crèche', icon: 'school' },
    { value: 'OTHER', label: 'Autre échange', icon: 'more_horiz' }
  ];

  samplePrompts: Record<PostType, string> = {
    QUESTION: 'Ex: Comment gérer la phase d\'opposition des 2 ans au moment des repas ?',
    ADVICE: 'Ex: Notre routine douce pour endormir bébé en moins de 15 minutes',
    RECOMMENDATION: 'Ex: Top 3 des aires de jeux ombragées et sécurisées dans le 11e',
    DISCUSSION: 'Ex: Reprise du travail et allaitement mixte : comment l\'avez-vous vécu ?'
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
    const initialType: PostType = ['QUESTION', 'ADVICE', 'RECOMMENDATION', 'DISCUSSION'].includes(initialTypeParam)
      ? initialTypeParam
      : 'QUESTION';

    this.postForm = this.fb.group({
      type: [initialType, [Validators.required]],
      category: ['NUTRITION' as PostCategory, [Validators.required]],
      title: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(130)]],
      content: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2500)]],
      tagsInput: [''],
      imageUrl: ['']
    });
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
    const user = this.authService.currentUser;
    const authorName = user ? `${user.firstName} ${user.lastName}` : 'Parent anonyme';
    const authorId = user ? user.id : 'user_current';
    const authorAvatar = user?.avatar || '';

    const formValues = this.postForm.value;

    const tags = formValues.tagsInput
      ? formValues.tagsInput
          .split(',')
          .map((t: string) => t.trim().toLowerCase().replace(/^#/, ''))
          .filter((t: string) => t.length > 0)
      : [];

    const images = formValues.imageUrl && formValues.imageUrl.trim()
      ? [formValues.imageUrl.trim()]
      : [];

    this.communityService
      .createPost({
        title: formValues.title.trim(),
        content: formValues.content.trim(),
        type: formValues.type,
        category: formValues.category,
        tags,
        images,
        authorId,
        authorName,
        authorAvatar
      })
      .subscribe({
        next: createdPost => {
          this.isSubmitting = false;
          this.toastService.success('Votre publication a été partagée dans la communauté !');
          this.router.navigate(['/app/community', createdPost.id]);
        },
        error: () => {
          this.isSubmitting = false;
          this.toastService.error('Erreur lors de la publication. Veuillez réessayer.');
        }
      });
  }
}
