import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventsService } from '../../services/events.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { EventCategory } from '../../../../shared/models';

interface CategoryOption {
  value: EventCategory;
  label: string;
  desc: string;
  icon: string;
  defaultImage: string;
}

@Component({
  selector: 'app-create-event',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './create-event.component.html',
  styleUrls: ['./create-event.component.scss']
})
export class CreateEventComponent implements OnInit {
  eventForm!: FormGroup;
  isSubmitting = false;

  categoryOptions: CategoryOption[] = [
    {
      value: 'WORKSHOP',
      label: 'Atelier & Activités',
      desc: 'Motricité, éveil musical, massage bébé, signes...',
      icon: 'palette',
      defaultImage: 'https://images.unsplash.com/photo-1596460107916-430662021049?w=800&auto=format&fit=crop&q=80'
    },
    {
      value: 'WALK',
      label: 'Sortie Poussette & Balade',
      desc: 'Promenade au parc, bol d\'air frais entre parents.',
      icon: 'directions_walk',
      defaultImage: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=800&auto=format&fit=crop&q=80'
    },
    {
      value: 'EXCHANGE',
      label: 'Bourse & Troc',
      desc: 'Vide-dressing puériculture, troc de jeux ou livres.',
      icon: 'swap_horiz',
      defaultImage: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=800&auto=format&fit=crop&q=80'
    },
    {
      value: 'MEETUP',
      label: 'Café Parents',
      desc: 'Discussions conviviales autour d\'un café ou thé.',
      icon: 'local_cafe',
      defaultImage: 'https://images.unsplash.com/photo-1541089404510-5c9a779841fc?w=800&auto=format&fit=crop&q=80'
    },
    {
      value: 'PLAYDATE',
      label: 'Jeux au square & Playdate',
      desc: 'Rendez-vous jeux libres entre enfants du même âge.',
      icon: 'toys',
      defaultImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&auto=format&fit=crop&q=80'
    }
  ];

  imagePresets = [
    {
      label: 'Atelier d\'éveil',
      url: 'https://images.unsplash.com/photo-1596460107916-430662021049?w=800&auto=format&fit=crop&q=80'
    },
    {
      label: 'Sortie poussette',
      url: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=800&auto=format&fit=crop&q=80'
    },
    {
      label: 'Bourse aux jouets',
      url: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=800&auto=format&fit=crop&q=80'
    },
    {
      label: 'Café & papote',
      url: 'https://images.unsplash.com/photo-1541089404510-5c9a779841fc?w=800&auto=format&fit=crop&q=80'
    }
  ];

  constructor(
    private fb: FormBuilder,
    private eventsService: EventsService,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Tomorrow's date as default
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const dateStr = tomorrow.toISOString().split('T')[0];

    this.eventForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
      category: ['WORKSHOP' as EventCategory, [Validators.required]],
      description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
      date: [dateStr, [Validators.required]],
      startTime: ['10:00', [Validators.required]],
      endTime: ['11:30'],
      address: ['', [Validators.required]],
      city: ['Paris', [Validators.required]],
      postalCode: ['75011', [Validators.required, Validators.pattern(/^[0-9]{5}$/)]],
      maxParticipants: [12, [Validators.required, Validators.min(2), Validators.max(100)]],
      isFree: [true, [Validators.required]],
      price: [0],
      imageUrl: [this.imagePresets[0].url]
    });
  }

  selectCategory(category: EventCategory): void {
    this.eventForm.patchValue({ category });
    const matched = this.categoryOptions.find(c => c.value === category);
    if (matched && !this.eventForm.get('imageUrl')?.value) {
      this.eventForm.patchValue({ imageUrl: matched.defaultImage });
    }
  }

  setFree(isFree: boolean): void {
    this.eventForm.patchValue({
      isFree,
      price: isFree ? 0 : 5
    });
  }

  chooseImagePreset(url: string): void {
    this.eventForm.patchValue({ imageUrl: url });
  }

  onSubmit(): void {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      this.toastService.warning('Veuillez renseigner tous les champs obligatoires.');
      return;
    }

    this.isSubmitting = true;
    const user = this.authService.currentUser;
    const organizerName = user ? `${user.firstName} ${user.lastName}` : 'Parent organisateur';
    const organizerId = user ? user.id : 'user_current';
    const organizerAvatar = user?.avatar || '';

    const formValues = this.eventForm.value;
    const eventDate = new Date(formValues.date);

    this.eventsService
      .createEvent({
        title: formValues.title.trim(),
        description: formValues.description.trim(),
        category: formValues.category,
        imageUrl: formValues.imageUrl,
        date: eventDate,
        startTime: formValues.startTime,
        endTime: formValues.endTime,
        address: formValues.address.trim(),
        city: formValues.city.trim(),
        postalCode: formValues.postalCode.trim(),
        maxParticipants: Number(formValues.maxParticipants),
        isFree: formValues.isFree,
        price: formValues.isFree ? 0 : Number(formValues.price),
        organizerId,
        organizerName,
        organizerAvatar
      })
      .subscribe({
        next: created => {
          this.isSubmitting = false;
          this.toastService.success(`L'événement "${created.title}" a été créé avec succès !`);
          this.router.navigate(['/app/events', created.id]);
        },
        error: () => {
          this.isSubmitting = false;
          this.toastService.error('Erreur lors de la création de l\'événement.');
        }
      });
  }
}
