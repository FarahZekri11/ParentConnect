// ===================================================
// ParentConnect — All TypeScript Models / Interfaces
// ===================================================

// --- Auth / User ---
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  city?: string;
  postalCode?: string;
  neighborhood?: string;
  bio?: string;
  phone?: string;
  joinedAt: Date;
  role: 'USER' | 'ADMIN';
}

export interface Family {
  id: string;
  userId: string;
  name: string;
  children: Child[];
}

export interface Child {
  id: string;
  firstName: string;
  birthDate: Date;
  gender?: 'M' | 'F' | 'OTHER';
  avatar?: string;
  allergies?: string;
  notes?: string;
}

// --- Marketplace ---
export type ListingType = 'SALE' | 'DONATION' | 'LENDING' | 'EXCHANGE';
export type ListingStatus = 'AVAILABLE' | 'RESERVED' | 'BORROWED' | 'COMPLETED' | 'CANCELLED';
export type ItemCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
export type ItemCategory =
  | 'PUERICULTURE' | 'STROLLERS' | 'CLOTHING' | 'TOYS'
  | 'FEEDING' | 'FURNITURE' | 'SAFETY' | 'MATERNITY' | 'OTHER';

export interface Listing {
  id: string;
  title: string;
  description: string;
  category: ItemCategory;
  condition: ItemCondition;
  type: ListingType;
  status: ListingStatus;
  price?: number;
  currency?: string;
  exchangePreferences?: string;
  targetAgeRange?: string;
  images: string[];
  tags: string[];
  location: ListingLocation;
  ownerId: string;
  ownerName: string;
  ownerAvatar?: string;
  familyId?: string;
  borrowDetails?: BorrowDetails;
  isFavorited?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListingLocation {
  city?: string;
  postalCode?: string;
  neighborhood?: string;
  coordinates?: number[];
}

export interface BorrowDetails {
  borrowerId: string;
  startDate: Date;
  returnDate?: Date;
  returnedAt?: Date;
  notes?: string;
}

export interface ListingQuery {
  search?: string;
  category?: ItemCategory;
  type?: ListingType;
  condition?: ItemCondition;
  status?: ListingStatus;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  postalCode?: string;
  ownerId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ListingsResponse {
  listings: Listing[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// --- Babysitting ---
export type BabysittingRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export interface BabysitterReview {
  id: string;
  authorName: string;
  authorAvatar?: string;
  rating: number;
  date: Date;
  comment: string;
}

export interface BabysitterProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  bio: string;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  city: string;
  postalCode?: string;
  neighborhood?: string;
  availabilities: Availability[];
  languages?: string[];
  experience?: string;
  ageGroups?: string[];
  certifications?: string[];
  reviews?: BabysitterReview[];
  verified: boolean;
  createdAt: Date;
}

export interface Availability {
  dayOfWeek: number; // 0=Sun, 6=Sat
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
}

export interface BabysittingRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  babysitterId?: string;
  babysitterName?: string;
  children: string[];
  date: Date;
  startTime: string;
  endTime: string;
  address: string;
  notes?: string;
  status: BabysittingRequestStatus;
  createdAt: Date;
}

export interface BabysittingBooking {
  id: string;
  requestId: string;
  babysitterId: string;
  babysitterName: string;
  babysitterAvatar?: string;
  requesterId: string;
  requesterName: string;
  date: Date;
  startTime: string;
  endTime: string;
  totalHours: number;
  totalCost: number;
  status: BabysittingRequestStatus;
  createdAt: Date;
}

// --- Community ---
export type PostType = 'QUESTION' | 'ADVICE' | 'DISCUSSION' | 'RECOMMENDATION';
export type PostCategory =
  | 'HEALTH' | 'NUTRITION' | 'EDUCATION' | 'SLEEP' | 'ACTIVITIES'
  | 'GEAR' | 'EMOTIONS' | 'PARENTING' | 'OTHER';

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  type: PostType;
  category: PostCategory;
  title: string;
  content: string;
  tags?: string[];
  images?: string[];
  commentCount: number;
  likeCount: number;
  isLiked?: boolean;
  isSaved?: boolean;
  isReported?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  likeCount: number;
  isLiked?: boolean;
  createdAt: Date;
}

// --- Events ---
export type EventCategory =
  | 'PLAYDATE' | 'WORKSHOP' | 'SPORT' | 'CULTURE' | 'WALK'
  | 'BIRTHDAY' | 'EXCHANGE' | 'MEETUP' | 'OTHER';

export interface Event {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerAvatar?: string;
  title: string;
  description: string;
  category: EventCategory;
  imageUrl?: string;
  date: Date;
  startTime: string;
  endTime?: string;
  address: string;
  city: string;
  postalCode?: string;
  maxParticipants?: number;
  participantCount: number;
  isJoined?: boolean;
  isFree: boolean;
  price?: number;
  participants?: EventParticipant[];
  createdAt: Date;
}

export interface EventParticipant {
  id: string;
  name: string;
  avatar?: string;
  joinedAt: Date;
}

// --- Messaging ---
export interface Conversation {
  id: string;
  participants: ConversationParticipant[];
  lastMessage?: Message;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
  isOnline?: boolean;
}

export interface ConversationParticipant {
  userId: string;
  name: string;
  avatar?: string;
  isOnline?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'TEXT' | 'IMAGE';
  isRead: boolean;
  sentAt: Date;
}

// --- Auth ---
export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  city?: string;
  postalCode?: string;
}
export interface AuthResponse { user: User; accessToken: string; }

// --- UI Helpers ---
export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface CategoryOption { value: string; label: string; icon: string; }
export interface SelectOption   { value: string; label: string; }
