import { Injectable } from '@angular/core';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { Post, Comment, PostCategory, PostType } from '../../../shared/models';

const INITIAL_MOCK_POSTS: Post[] = [
  {
    id: 'post_1',
    authorId: 'user_2',
    authorName: 'Camille Leroy',
    authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    type: 'QUESTION',
    category: 'NUTRITION',
    title: 'Diversification menée par l\'enfant (DME) : par quoi commencer à 6 mois ?',
    content: 'Bonjour à tous ! Mon petit Hugo vient d\'avoir 6 mois et tient bien assis. Nous aimerions débuter la DME plutôt que les purées classiques. Avez-vous des légumes faciles et sécurisés pour les premiers jours ? Comment avez-vous géré l\'angoisse des premières fausses routes ? Merci d\'avance pour vos retours précieux !',
    tags: ['dme', 'diversification', 'alimentation', '6mois'],
    images: ['https://images.unsplash.com/photo-1596460107916-430662021049?w=600&auto=format&fit=crop&q=80'],
    commentCount: 6,
    likeCount: 24,
    isLiked: false,
    isSaved: true,
    isReported: false,
    createdAt: new Date('2026-10-04T09:30:00Z'),
    updatedAt: new Date('2026-10-04T09:30:00Z')
  },
  {
    id: 'post_2',
    authorId: 'user_3',
    authorName: 'Marc Dubreuil',
    authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    type: 'ADVICE',
    category: 'SLEEP',
    title: 'Notre rituel du coucher infaillible pour bébé de 9 mois qui luttait contre le sommeil',
    content: 'Après 3 mois de couchers très chaotiques (cris, bercements de 45 min), on a enfin trouvé un rythme doux qui fonctionne à 100% : 1) Baignoire à 19h avec lumière tamisée, 2) Massage doux des pieds avec huile d\'amande douce, 3) Lecture du même petit livre cartonné dans la pénombre, 4) Berceuse douce puis pose dans le lit encore éveillé mais détendu. En 5 jours, il s\'endort désormais paisiblement seul ! Si ça peut aider des parents épuisés, tenez bon !',
    tags: ['sommeil', 'rituelcoucher', 'astuce', 'bebeheureux'],
    commentCount: 11,
    likeCount: 52,
    isLiked: true,
    isSaved: true,
    isReported: false,
    createdAt: new Date('2026-10-03T18:45:00Z'),
    updatedAt: new Date('2026-10-03T18:45:00Z')
  },
  {
    id: 'post_3',
    authorId: 'user_4',
    authorName: 'Élodie Mercier',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    type: 'RECOMMENDATION',
    category: 'GEAR',
    title: 'Poussette compacte homologuée cabine avion : notre comparatif après 3 voyages',
    content: 'Si vous hésitez entre la Yoyo de Babyzen et la Cybex Orfeo : nous avons testé les deux ! La Yoyo reste imbattable pour la maniabilité et le pliage d\'une main dans le couloir de l\'avion. En revanche, la Cybex s\'allonge complètement à plat pour la sieste des nourrissons. Les deux rentrent sans souci dans le coffre à bagages d\'Air France et EasyJet.',
    tags: ['poussette', 'voyageavecbébé', 'materiel', 'cybex', 'babyzen'],
    images: ['https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&auto=format&fit=crop&q=80'],
    commentCount: 4,
    likeCount: 38,
    isLiked: false,
    isSaved: false,
    isReported: false,
    createdAt: new Date('2026-10-02T14:15:00Z'),
    updatedAt: new Date('2026-10-02T14:15:00Z')
  },
  {
    id: 'post_4',
    authorId: 'user_5',
    authorName: 'Amina Belkacem',
    authorAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    type: 'QUESTION',
    category: 'HEALTH',
    title: 'Pédiatre bienveillant et à l\'écoute dans le 11e arrondissement ou alentours ?',
    content: 'Bonjour à tous les parents du quartier ! Nous venons d\'emménager près du métro Voltaire et recherchons un pédiatre ou médecin généraliste orienté pédiatrie pour notre fille de 14 mois. Nous cherchons quelqu\'un de doux, qui prend le temps d\'expliquer et qui est pro-allaitement. Des recommandations à partager ?',
    tags: ['pediatre', 'sante', 'paris11', 'recommandation'],
    commentCount: 8,
    likeCount: 17,
    isLiked: false,
    isSaved: false,
    isReported: false,
    createdAt: new Date('2026-10-01T11:00:00Z'),
    updatedAt: new Date('2026-10-01T11:00:00Z')
  },
  {
    id: 'post_5',
    authorId: 'user_6',
    authorName: 'Julien et Nicolas',
    authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    type: 'ADVICE',
    category: 'ACTIVITIES',
    title: '3 activités d\'éveil sensoriel gratuites et sans préparation avec ce qu\'on a en cuisine',
    content: 'Pas besoin d\'acheter des jouets Montessori coûteux ! Voici ce qui captive nos jumeaux de 15 mois pendant 30 minutes : 1) Les bacs de pâtes crues avec de grandes cuillères en bois, 2) La boîte à mouchoirs vide remplie de chutes de tissus colorés à tirer, 3) Le tambour de casseroles avec spatules en silicone. Fou rire garanti et motricité fine stimulée !',
    tags: ['eveil', 'activites', 'motricite', 'montessori', 'diy'],
    commentCount: 15,
    likeCount: 67,
    isLiked: true,
    isSaved: false,
    isReported: false,
    createdAt: new Date('2026-09-30T16:20:00Z'),
    updatedAt: new Date('2026-09-30T16:20:00Z')
  },
  {
    id: 'post_6',
    authorId: 'user_7',
    authorName: 'Sophie Fontaine',
    authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    type: 'QUESTION',
    category: 'EMOTIONS',
    title: 'Crise des 2 ans ("terrible two") : comment rester calme face aux tempêtes émotionnelles ?',
    content: 'Ma petite de 22 mois traverse une phase intense de frustrations avec cris et pleurs dès qu\'un refus est exprimé (pour enfiler les chaussures, quitter le parc...). Je m\'efforce d\'accueillir ses émotions avec empathie mais la fatigue s\'accumule. Quelles phrases magiques ou attitudes vous aident à désamorcer ces moments ?',
    tags: ['emotions', 'parentalitepositive', 'terribletwo', 'patience'],
    commentCount: 19,
    likeCount: 43,
    isLiked: false,
    isSaved: true,
    isReported: false,
    createdAt: new Date('2026-09-29T10:10:00Z'),
    updatedAt: new Date('2026-09-29T10:10:00Z')
  }
];

const INITIAL_COMMENTS: Comment[] = [
  {
    id: 'com_1',
    postId: 'post_1',
    authorId: 'user_8',
    authorName: 'Claire V.',
    authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    content: 'Les fleurettes de brocoli très cuites ou les bâtonnets de patate douce au four sont top pour commencer ! Ils les attrapent très facilement avec la paume entière.',
    likeCount: 9,
    isLiked: false,
    createdAt: new Date('2026-10-04T10:15:00Z')
  },
  {
    id: 'com_2',
    postId: 'post_1',
    authorId: 'user_3',
    authorName: 'Marc Dubreuil',
    authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    content: 'Pour la peur des fausses routes, faire une courte formation aux gestes de premiers secours pédiatriques avec la Croix-Rouge nous a complètement libérés de l\'angoisse ! Très recommandé.',
    likeCount: 14,
    isLiked: true,
    createdAt: new Date('2026-10-04T11:40:00Z')
  },
  {
    id: 'com_3',
    postId: 'post_2',
    authorId: 'user_1',
    authorName: 'Farah Zekri',
    authorAvatar: '',
    content: 'Merci Marc ! Le massage des pieds avant la berceuse a changé nos soirées avec Yasmine. C\'est devenu notre moment complice préféré.',
    likeCount: 4,
    isLiked: false,
    createdAt: new Date('2026-10-03T20:00:00Z')
  },
  {
    id: 'com_4',
    postId: 'post_4',
    authorId: 'user_9',
    authorName: 'Thomas R.',
    authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    content: 'Le Dr. Vacher rue de la Roquette est exceptionnel. Il prend 40 minutes par consultation, est d\'une douceur rare et ne culpabilise jamais les parents.',
    likeCount: 6,
    isLiked: false,
    createdAt: new Date('2026-10-01T13:20:00Z')
  }
];

@Injectable({ providedIn: 'root' })
export class CommunityService {
  private postsSubject = new BehaviorSubject<Post[]>(INITIAL_MOCK_POSTS);
  private commentsSubject = new BehaviorSubject<Comment[]>(INITIAL_COMMENTS);

  posts$ = this.postsSubject.asObservable();
  comments$ = this.commentsSubject.asObservable();

  getPosts(category?: string, type?: string, search?: string): Observable<Post[]> {
    return this.posts$.pipe(
      delay(300),
      map(posts => {
        let list = [...posts];

        if (category && category !== 'ALL') {
          list = list.filter(p => p.category.toUpperCase() === category.toUpperCase());
        }

        if (type && type !== 'ALL') {
          list = list.filter(p => p.type.toUpperCase() === type.toUpperCase());
        }

        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          list = list.filter(p =>
            p.title.toLowerCase().includes(q) ||
            p.content.toLowerCase().includes(q) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(q))) ||
            p.authorName.toLowerCase().includes(q)
          );
        }

        return list;
      })
    );
  }

  getPostById(id: string): Observable<Post | undefined> {
    return this.posts$.pipe(
      delay(200),
      map(posts => posts.find(p => p.id === id))
    );
  }

  createPost(data: {
    title: string;
    content: string;
    type: PostType;
    category: PostCategory;
    tags?: string[];
    images?: string[];
    authorId: string;
    authorName: string;
    authorAvatar?: string;
  }): Observable<Post> {
    const newPost: Post = {
      id: 'post_' + Date.now(),
      title: data.title,
      content: data.content,
      type: data.type,
      category: data.category,
      tags: data.tags || [],
      images: data.images || [],
      authorId: data.authorId,
      authorName: data.authorName,
      authorAvatar: data.authorAvatar,
      likeCount: 0,
      commentCount: 0,
      isLiked: false,
      isSaved: false,
      isReported: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const current = this.postsSubject.value;
    this.postsSubject.next([newPost, ...current]);
    return of(newPost).pipe(delay(400));
  }

  likePost(id: string): Observable<{ likes: number; isLiked: boolean }> {
    const current = [...this.postsSubject.value];
    const index = current.findIndex(p => p.id === id);

    if (index === -1) {
      return of({ likes: 0, isLiked: false });
    }

    const post = { ...current[index] };
    const willBeLiked = !post.isLiked;
    post.isLiked = willBeLiked;
    post.likeCount = willBeLiked ? post.likeCount + 1 : Math.max(0, post.likeCount - 1);

    current[index] = post;
    this.postsSubject.next(current);

    return of({ likes: post.likeCount, isLiked: post.isLiked }).pipe(delay(150));
  }

  toggleSavePost(id: string): Observable<boolean> {
    const current = [...this.postsSubject.value];
    const index = current.findIndex(p => p.id === id);

    if (index === -1) return of(false);

    const post = { ...current[index] };
    post.isSaved = !post.isSaved;
    current[index] = post;
    this.postsSubject.next(current);

    return of(post.isSaved).pipe(delay(150));
  }

  getCommentsByPostId(postId: string): Observable<Comment[]> {
    return this.comments$.pipe(
      delay(200),
      map(comments =>
        comments
          .filter(c => c.postId === postId)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      )
    );
  }

  addComment(
    postId: string,
    content: string,
    author: { id: string; name: string; avatar?: string }
  ): Observable<Comment> {
    const newComment: Comment = {
      id: 'com_' + Date.now(),
      postId,
      authorId: author.id,
      authorName: author.name,
      authorAvatar: author.avatar,
      content: content.trim(),
      likeCount: 0,
      isLiked: false,
      createdAt: new Date()
    };

    // Update comments
    const allComments = [...this.commentsSubject.value, newComment];
    this.commentsSubject.next(allComments);

    // Increment comment count on the post
    const posts = [...this.postsSubject.value];
    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex !== -1) {
      posts[postIndex] = {
        ...posts[postIndex],
        commentCount: posts[postIndex].commentCount + 1
      };
      this.postsSubject.next(posts);
    }

    return of(newComment).pipe(delay(350));
  }

  likeComment(commentId: string): Observable<Comment> {
    const allComments = [...this.commentsSubject.value];
    const idx = allComments.findIndex(c => c.id === commentId);

    if (idx === -1) throw new Error('Comment not found');

    const comment = { ...allComments[idx] };
    comment.isLiked = !comment.isLiked;
    comment.likeCount = comment.isLiked ? comment.likeCount + 1 : Math.max(0, comment.likeCount - 1);

    allComments[idx] = comment;
    this.commentsSubject.next(allComments);

    return of(comment).pipe(delay(150));
  }

  reportPost(id: string, reason?: string): Observable<boolean> {
    const current = [...this.postsSubject.value];
    const index = current.findIndex(p => p.id === id);

    if (index !== -1) {
      current[index] = { ...current[index], isReported: true };
      this.postsSubject.next(current);
    }

    return of(true).pipe(delay(300));
  }
}
