import { Component, ElementRef, ViewChild, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent implements AfterViewInit {
  @ViewChild('bgVideo') videoRef!: ElementRef<HTMLVideoElement>;
  readonly authService = inject(AuthService);
  isMuted = true;
  isPlaying = true;

  features = [
    { icon: 'storefront',      title: 'Marketplace',  desc: 'Donnez, vendez, prêtez ou échangez du matériel bébé entre parents du quartier.', color: '#2E5C4E', light: '#E9F0EA' },
    { icon: 'child_care',      title: 'Babysitting',  desc: 'Trouvez une garde de confiance ou proposez vos services entre parents locaux.', color: '#C2703F', light: '#FBEBDD' },
    { icon: 'forum',           title: 'Communauté',   desc: 'Partagez vos questions, conseils et expériences avec des parents du même quartier.', color: '#6F2A42', light: '#F7E9EE' },
    { icon: 'event',           title: 'Événements',   desc: 'Découvrez et organisez des activités locales pour vos enfants et votre famille.', color: '#22453A', light: '#E4EDE7' },
    { icon: 'chat_bubble',     title: 'Messagerie',   desc: 'Communiquez facilement et en toute sécurité avec les autres parents.', color: '#7E5C7C', light: '#F3ECF5' },
    { icon: 'family_restroom', title: 'Ma Famille',   desc: 'Gérez votre profil familial et renseignez les informations de vos enfants.', color: '#40647A', light: '#EAF0F3' },
  ];

  steps = [
    { num: '01', title: 'Créez votre profil famille', desc: 'Votre quartier, vos enfants, leurs âges et leurs besoins. Rien de plus.' },
    { num: '02', title: 'Trouvez ce qu’il vous faut', desc: 'Un objet à prêter, une garde pour samedi, un conseil de voisin : tout est à portée de main.' },
    { num: '03', title: 'Rencontrez vos voisins', desc: 'Échangez en message, retrouvez-vous au square ou autour d’un atelier. Le lien se crée naturellement.' },
  ];

  stats = [
    { value: '2 400+', label: 'Parents inscrits' },
    { value: '850+',   label: 'Annonces actives' },
    { value: '120+',   label: 'Quartiers connectés' },
    { value: '98%',    label: 'Satisfaction' },
  ];

  ngAfterViewInit() {
    if (this.videoRef?.nativeElement) {
      const v = this.videoRef.nativeElement;
      v.muted = true;
      v.volume = 0;
      v.defaultMuted = true;
      v.play().catch(() => {});
    }
  }

  togglePlay() {
    if (!this.videoRef?.nativeElement) return;
    const v = this.videoRef.nativeElement;
    if (v.paused) {
      v.play();
      this.isPlaying = true;
    } else {
      v.pause();
      this.isPlaying = false;
    }
  }
}
