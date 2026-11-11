import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MarketplaceService } from '../../services/marketplace.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { ItemCategory, ListingType, ItemCondition, Listing } from '../../../../shared/models';

@Component({
  selector: 'app-create-listing',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './create-listing.component.html',
  styleUrls: ['./create-listing.component.scss']
})
export class CreateListingComponent implements OnInit {
  listingForm!: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  listingId: string | null = null;
  tagInput = '';
  tagsList: string[] = [];
  selectedSampleImage = '';

  categories: { value: ItemCategory; label: string; icon: string }[] = [
    { value: 'PUERICULTURE', label: 'Puériculture', icon: 'child_care' },
    { value: 'STROLLERS', label: 'Poussettes', icon: 'stroller' },
    { value: 'CLOTHING', label: 'Vêtements', icon: 'checkroom' },
    { value: 'FURNITURE', label: 'Meubles & Chambre', icon: 'crib' },
    { value: 'TOYS', label: 'Jouets & Éveil', icon: 'toys' },
    { value: 'FEEDING', label: 'Repas & Allaitement', icon: 'restaurant' },
    { value: 'SAFETY', label: 'Sécurité', icon: 'verified_user' },
    { value: 'MATERNITY', label: 'Maternité', icon: 'pregnant_woman' },
    { value: 'OTHER', label: 'Autre', icon: 'more_horiz' }
  ];

  conditions: { value: ItemCondition; label: string; hint: string }[] = [
    { value: 'NEW', label: 'Neuf avec étiquette', hint: 'Jamais déballé ou utilisé' },
    { value: 'LIKE_NEW', label: 'Comme neuf', hint: 'Très peu utilisé, aucun défaut visible' },
    { value: 'GOOD', label: 'Très bon état', hint: 'Signes mineurs d’usure normale' },
    { value: 'FAIR', label: 'État satisfaisant', hint: 'Traces d’usure visibles mais parfaitement fonctionnel' }
  ];

  listingTypes: { value: ListingType; label: string; desc: string; icon: string; badgeClass: string }[] = [
    { value: 'DONATION', label: 'À donner', desc: 'Entraide & solidarité, 100% gratuit', icon: 'volunteer_activism', badgeClass: 'type-donation' },
    { value: 'SALE', label: 'À vendre', desc: 'Fixez un prix abordable pour d’autres parents', icon: 'sell', badgeClass: 'type-sale' },
    { value: 'LENDING', label: 'À prêter', desc: 'Prêt temporaire d’équipement pour dépanner', icon: 'schedule', badgeClass: 'type-lending' },
    { value: 'EXCHANGE', label: 'À échanger', desc: 'Troc contre un autre article ou service', icon: 'swap_horiz', badgeClass: 'type-exchange' }
  ];

  sampleImages: { url: string; label: string }[] = [
    { url: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80', label: 'Poussette' },
    { url: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=600&q=80', label: 'Vêtements' },
    { url: 'https://images.unsplash.com/photo-1541089404510-5c9a779841fc?w=600&q=80', label: 'Mobilier' },
    { url: 'https://images.unsplash.com/photo-1596460107916-430662021049?w=600&q=80', label: 'Jouets' }
  ];

  ageRanges = [
    '0 - 6 mois',
    '6 - 12 mois',
    '1 - 2 ans',
    '2 - 3 ans',
    '3 - 5 ans',
    '5 ans et plus',
    'Tous âges'
  ];

  constructor(
    private fb: FormBuilder,
    private marketplaceService: MarketplaceService,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initForm();

    const currentUser = this.authService.currentUser;
    if (currentUser) {
      this.listingForm.patchValue({
        city: currentUser.city || 'Paris',
        postalCode: currentUser.postalCode || '75011',
        neighborhood: currentUser.neighborhood || 'Oberkampf'
      });
    }

    // Check if editing
    this.listingId = this.route.snapshot.paramMap.get('id');
    if (this.listingId) {
      this.isEditMode = true;
      this.loadExistingListing(this.listingId);
    }
  }

  private initForm(): void {
    this.listingForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(100)]],
      category: ['PUERICULTURE' as ItemCategory, [Validators.required]],
      condition: ['GOOD' as ItemCondition, [Validators.required]],
      type: ['DONATION' as ListingType, [Validators.required]],
      price: [{ value: 0, disabled: true }],
      exchangePreferences: [''],
      description: ['', [Validators.required, Validators.minLength(15), Validators.maxLength(2000)]],
      city: ['', [Validators.required]],
      postalCode: ['', [Validators.required]],
      neighborhood: [''],
      targetAgeRange: ['0 - 6 mois'],
      imageUrl: ['https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80']
    });

    // Listen to type changes to adjust validators on price & exchangePreferences
    this.listingForm.get('type')?.valueChanges.subscribe((type: ListingType) => {
      this.updatePriceValidation(type);
    });
  }

  private updatePriceValidation(type: ListingType): void {
    const priceCtrl = this.listingForm.get('price');
    const exchangeCtrl = this.listingForm.get('exchangePreferences');

    if (type === 'SALE') {
      priceCtrl?.enable();
      priceCtrl?.setValidators([Validators.required, Validators.min(0.5)]);
      if (priceCtrl?.value === 0 || !priceCtrl?.value) {
        priceCtrl?.setValue(10);
      }
    } else if (type === 'LENDING') {
      // For lending, price can be optional deposit or 0
      priceCtrl?.enable();
      priceCtrl?.clearValidators();
      priceCtrl?.setValue(0);
    } else {
      // DONATION or EXCHANGE: free, price disabled
      priceCtrl?.setValue(0);
      priceCtrl?.disable();
      priceCtrl?.clearValidators();
    }
    priceCtrl?.updateValueAndValidity();

    if (type === 'EXCHANGE') {
      exchangeCtrl?.setValidators([Validators.required]);
    } else {
      exchangeCtrl?.clearValidators();
    }
    exchangeCtrl?.updateValueAndValidity();
  }

  private loadExistingListing(id: string): void {
    this.marketplaceService.getListingById(id).subscribe({
      next: (listing) => {
        if (!listing) {
          this.toastService.error('Annonce introuvable');
          this.router.navigate(['/app/marketplace']);
          return;
        }
        this.tagsList = listing.tags || [];
        this.listingForm.patchValue({
          title: listing.title,
          category: listing.category,
          condition: listing.condition,
          type: listing.type,
          price: listing.price || 0,
          exchangePreferences: listing.exchangePreferences || '',
          description: listing.description,
          city: listing.location?.city || '',
          postalCode: listing.location?.postalCode || '',
          neighborhood: listing.location?.neighborhood || '',
          targetAgeRange: listing.targetAgeRange || 'Tous âges',
          imageUrl: listing.images && listing.images.length > 0 ? listing.images[0] : ''
        });
        this.updatePriceValidation(listing.type);
      },
      error: () => {
        this.toastService.error('Erreur lors du chargement de l’annonce');
        this.router.navigate(['/app/marketplace']);
      }
    });
  }

  selectType(type: ListingType): void {
    this.listingForm.patchValue({ type });
  }

  selectSampleImage(sample: { url: string; label: string }): void {
    this.selectedSampleImage = sample.url;
    this.listingForm.patchValue({ imageUrl: sample.url });
  }

  addTag(event: Event): void {
    event.preventDefault();
    const tag = this.tagInput.trim().replace(/^#/, '');
    if (tag && !this.tagsList.includes(tag) && this.tagsList.length < 8) {
      this.tagsList.push(tag);
      this.tagInput = '';
    }
  }

  removeTag(tag: string): void {
    this.tagsList = this.tagsList.filter(t => t !== tag);
  }

  onSubmit(): void {
    if (this.listingForm.invalid) {
      this.listingForm.markAllAsTouched();
      this.toastService.warning('Veuillez remplir correctement tous les champs obligatoires.');
      return;
    }

    this.isSubmitting = true;
    const formVal = this.listingForm.getRawValue();

    const currentUser = this.authService.currentUser;
    const ownerId = currentUser ? currentUser.id : 'user_1';
    const ownerName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Farah Zekri';

    const listingPayload: Partial<Listing> = {
      title: formVal.title,
      category: formVal.category,
      condition: formVal.condition,
      type: formVal.type,
      price: formVal.type === 'SALE' ? Number(formVal.price) : (formVal.type === 'LENDING' ? Number(formVal.price || 0) : 0),
      currency: 'EUR',
      exchangePreferences: formVal.type === 'EXCHANGE' ? formVal.exchangePreferences : undefined,
      targetAgeRange: formVal.targetAgeRange,
      description: formVal.description,
      images: formVal.imageUrl ? [formVal.imageUrl] : ['https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80'],
      tags: this.tagsList,
      location: {
        city: formVal.city,
        postalCode: formVal.postalCode,
        neighborhood: formVal.neighborhood
      }
    };

    if (this.isEditMode && this.listingId) {
      this.marketplaceService.updateListing(this.listingId, listingPayload).subscribe({
        next: () => {
          this.toastService.success('Votre annonce a été mise à jour avec succès !');
          this.isSubmitting = false;
          this.router.navigate(['/app/marketplace', this.listingId]);
        },
        error: () => {
          this.toastService.error('Erreur lors de la modification de l’annonce.');
          this.isSubmitting = false;
        }
      });
    } else {
      this.marketplaceService.createListing(listingPayload, ownerId, ownerName).subscribe({
        next: (created) => {
          this.toastService.success('Votre annonce a été publiée avec succès !');
          this.isSubmitting = false;
          this.router.navigate(['/app/marketplace']);
        },
        error: () => {
          this.toastService.error('Erreur lors de la publication de l’annonce.');
          this.isSubmitting = false;
        }
      });
    }
  }
}
