import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { Listing, ListingDocument } from './schemas/listing.schema';
import {
  BorrowRequest,
  BorrowRequestDocument,
  BorrowRequestStatus,
} from './schemas/borrow-request.schema';
import { Favorite, FavoriteDocument } from './schemas/favorite.schema';
import {
  ListingReview,
  ListingReviewDocument,
} from './schemas/listing-review.schema';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { QueryListingsDto } from './dto/query-listings.dto';
import { BorrowListingDto } from './dto/borrow-listing.dto';
import {
  CreateBorrowRequestDto,
  RejectBorrowRequestDto,
} from './dto/borrow-request.dto';
import { CreateListingReviewDto } from './dto/listing-review.dto';
import { ListingStatus } from './enums/listing-status.enum';
import { ListingType } from './enums/listing-type.enum';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class ListingsService {
  constructor(
    @InjectModel(Listing.name)
    private readonly listingModel: Model<ListingDocument>,
    @InjectModel(BorrowRequest.name)
    private readonly borrowRequestModel: Model<BorrowRequestDocument>,
    @InjectModel(Favorite.name)
    private readonly favoriteModel: Model<FavoriteDocument>,
    @InjectModel(ListingReview.name)
    private readonly listingReviewModel: Model<ListingReviewDocument>,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  /**
   * Create a new marketplace listing and publish RabbitMQ event
   */
  /** Compteurs réels pour le tableau de bord administrateur (annonces non supprimées). */
  async stats(): Promise<Record<string, unknown>> {
    const group = async (field: string) => {
      const rows = await this.listingModel
        .aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$' + field, count: { $sum: 1 } } }])
        .exec();
      return Object.fromEntries(rows.map((r: { _id: string; count: number }) => [String(r._id), r.count]));
    };
    const [total, byStatus, byType, byCurrency, borrowRequests, reviews] = await Promise.all([
      this.listingModel.countDocuments({ isDeleted: false }).exec(),
      group('status'),
      group('type'),
      group('currency'),
      this.borrowRequestModel.countDocuments({}).exec(),
      this.listingReviewModel.countDocuments({}).exec(),
    ]);
    return {
      listings: total,
      by_status: byStatus,
      by_type: byType,
      by_currency: byCurrency,
      borrow_requests: borrowRequests,
      reviews,
    };
  }

  async create(
    createDto: CreateListingDto,
    ownerId: string,
    ownerName?: string,
  ): Promise<ListingDocument> {
    if (!ownerId) {
      throw new BadRequestException('Owner ID is required to create a listing.');
    }

    // Business rule: Donation items must have a price of 0
    let price = createDto.price ?? 0;
    if (createDto.type === ListingType.DONATION) {
      price = 0;
    }

    // Business rule: Sale items should have a valid price
    if (
      createDto.type === ListingType.SALE &&
      (price === undefined || price <= 0)
    ) {
      throw new BadRequestException(
        'Items for sale must have a price greater than 0.',
      );
    }

    const createdListing = new this.listingModel({
      ...createDto,
      price,
      ownerId,
      ownerName: ownerName || undefined,
      status: ListingStatus.AVAILABLE,
      isDeleted: false,
    });

    const saved = await createdListing.save();

    // ➔ Asynchronous Event-Driven Messaging: Publish to real RabbitMQ
    await this.rabbitMQService.publishEvent('listing.created', {
      id: saved._id,
      title: saved.title,
      category: saved.category,
      type: saved.type,
      price: saved.price,
      ownerId: saved.ownerId,
      location: saved.location,
      createdAt: saved.createdAt,
    });

    return saved;
  }

  /**
   * Retrieve listings with search, filtering, and pagination
   */
  async findAll(query: QueryListingsDto): Promise<{
    listings: ListingDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const filter: FilterQuery<ListingDocument> = { isDeleted: false };

    // Status filter - defaults to AVAILABLE if not specified, unless filtering specifically
    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = ListingStatus.AVAILABLE;
    }

    // Type filter (DONATION, SALE, LENDING, EXCHANGE)
    if (query.type) {
      filter.type = query.type;
    }

    // Category filter
    if (query.category) {
      filter.category = query.category;
    }

    // Condition filter
    if (query.condition) {
      filter.condition = query.condition;
    }

    // Owner filter
    if (query.ownerId) {
      filter.ownerId = query.ownerId;
    }

    // Proximité : annonces dont la position approximative est dans le rayon (sphère terrestre, R = 6378,1 km).
    // $geoWithin ne trie pas par distance et reste compatible avec le tri et la pagination demandés.
    if (query.lat !== undefined && query.lng !== undefined) {
      const radiusKm = query.radiusKm ?? 10;
      filter['location.coordinates'] = {
        $geoWithin: { $centerSphere: [[query.lng, query.lat], radiusKm / 6378.1] },
      };
    }

    // Price range filters
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.price = {};
      if (query.minPrice !== undefined) {
        filter.price.$gte = query.minPrice;
      }
      if (query.maxPrice !== undefined) {
        filter.price.$lte = query.maxPrice;
      }
    }

    // Location filters
    if (query.city) {
      filter['location.city'] = { $regex: new RegExp(query.city, 'i') };
    }
    if (query.postalCode) {
      filter['location.postalCode'] = query.postalCode;
    }

    // Keyword search (searches title, description, or tags with regex for partial matching)
    if (query.search && query.search.trim() !== '') {
      const sanitized = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(sanitized, 'i');
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex },
      ];
    }

    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sortOptions: Record<string, 1 | -1> = { [sortField]: sortOrder };

    const [listings, total] = await Promise.all([
      this.listingModel
        .find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.listingModel.countDocuments(filter).exec(),
    ]);

    return {
      listings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Find a single listing by its ID
   */
  async findById(id: string): Promise<ListingDocument> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`Invalid listing ID format: ${id}`);
    }

    const listing = await this.listingModel
      .findOne({ _id: id, isDeleted: false })
      .exec();
    if (!listing) {
      throw new NotFoundException(`Listing with ID '${id}' not found.`);
    }

    return listing;
  }

  /**
   * Update an existing listing (owner or admin only)
   */
  async update(
    id: string,
    updateDto: UpdateListingDto,
    userId: string,
    userRoles: string[] = [],
  ): Promise<ListingDocument> {
    const listing = await this.findById(id);

    // Authorization check (Keycloak user or admin)
    const isOwner = listing.ownerId === userId;
    const isAdmin =
      userRoles.includes('ADMIN') || userRoles.includes('ROLE_ADMIN');

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You do not have Keycloak permission to update this listing.',
      );
    }

    // Business rules for price updates
    const effectiveType = updateDto.type || listing.type;
    let effectivePrice =
      updateDto.price !== undefined ? updateDto.price : listing.price;

    if (effectiveType === ListingType.DONATION) {
      effectivePrice = 0;
    } else if (effectiveType === ListingType.SALE && effectivePrice <= 0) {
      throw new BadRequestException(
        'Items for sale must have a price greater than 0.',
      );
    }

    Object.assign(listing, updateDto, { price: effectivePrice });
    const saved = await listing.save();

    // ➔ Asynchronous Event-Driven Messaging: Publish to RabbitMQ
    await this.rabbitMQService.publishEvent('listing.updated', {
      id: saved._id,
      title: saved.title,
      price: saved.price,
      status: saved.status,
      updatedBy: userId,
      updatedAt: saved.updatedAt,
    });

    return saved;
  }

  /**
   * Delete a listing (soft delete, owner or admin only)
   */
  async remove(
    id: string,
    userId: string,
    userRoles: string[] = [],
  ): Promise<{ message: string; id: string }> {
    const listing = await this.findById(id);

    const isOwner = listing.ownerId === userId;
    const isAdmin =
      userRoles.includes('ADMIN') || userRoles.includes('ROLE_ADMIN');

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You do not have Keycloak permission to delete this listing.',
      );
    }

    listing.isDeleted = true;
    listing.status = ListingStatus.CANCELLED;
    await listing.save();

    // ➔ Asynchronous Event-Driven Messaging: Publish to RabbitMQ
    await this.rabbitMQService.publishEvent('listing.deleted', {
      id,
      ownerId: listing.ownerId,
      deletedBy: userId,
      deletedAt: new Date().toISOString(),
    });

    return {
      message: `Listing '${id}' was successfully deleted.`,
      id,
    };
  }

  // =========================================================================
  // BORROW REQUESTS WORKFLOW (Pending -> Accepted/Rejected -> Returned)
  // =========================================================================

  /**
   * Create a formal borrowing request for a LENDING listing
   */
  async createBorrowRequest(
    listingId: string,
    createDto: CreateBorrowRequestDto,
    borrower: { userId: string; username?: string; email?: string },
  ): Promise<BorrowRequestDocument> {
    const listing = await this.findById(listingId);

    if (listing.type !== ListingType.LENDING) {
      throw new BadRequestException(
        `Only items with type 'LENDING' can be requested for borrowing. Current type: '${listing.type}'.`,
      );
    }

    if (listing.status !== ListingStatus.AVAILABLE) {
      throw new BadRequestException(
        `This item is currently not available for borrowing (Status: ${listing.status}).`,
      );
    }

    if (listing.ownerId === borrower.userId) {
      throw new BadRequestException('You cannot borrow your own listing.');
    }

    // Check for existing pending request from the same user to prevent spam
    const existingPending = await this.borrowRequestModel.findOne({
      listingId,
      borrowerId: borrower.userId,
      status: BorrowRequestStatus.PENDING,
    });

    if (existingPending) {
      throw new ConflictException(
        'You already have an active pending borrow request for this item.',
      );
    }

    const startDate = new Date(createDto.startDate);
    const returnDate = createDto.returnDate
      ? new Date(createDto.returnDate)
      : undefined;

    if (returnDate && returnDate <= startDate) {
      throw new BadRequestException('Return date must be after start date.');
    }

    const request = new this.borrowRequestModel({
      listingId,
      borrowerId: borrower.userId,
      borrowerName: borrower.username || 'Parent User',
      borrowerEmail: borrower.email,
      ownerId: listing.ownerId,
      startDate,
      returnDate,
      notes: createDto.notes,
      status: BorrowRequestStatus.PENDING,
    });

    const saved = await request.save();

    // ➔ RabbitMQ event
    await this.rabbitMQService.publishEvent('listing.borrow_request.created', {
      requestId: saved._id,
      listingId,
      listingTitle: listing.title,
      ownerId: listing.ownerId,
      borrowerId: borrower.userId,
      startDate: saved.startDate,
      returnDate: saved.returnDate,
    });

    return saved;
  }

  /**
   * Get all borrow requests for a specific listing (owner or admin only)
   */
  async getListingBorrowRequests(
    listingId: string,
    userId: string,
    userRoles: string[] = [],
  ): Promise<BorrowRequestDocument[]> {
    const listing = await this.findById(listingId);
    const isOwner = listing.ownerId === userId;
    const isAdmin =
      userRoles.includes('ADMIN') || userRoles.includes('ROLE_ADMIN');

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the listing owner can view borrow requests.',
      );
    }

    return this.borrowRequestModel
      .find({ listingId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get borrow requests made by the current user
   */
  async getMyBorrowRequests(userId: string): Promise<BorrowRequestDocument[]> {
    return this.borrowRequestModel
      .find({ borrowerId: userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get incoming borrow requests for items owned by the current user
   */
  async getIncomingBorrowRequests(
    userId: string,
  ): Promise<BorrowRequestDocument[]> {
    return this.borrowRequestModel
      .find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Accept a borrow request (Item Owner only)
   * Resolves conflicts: automatically marks other pending requests for this item as REJECTED
   */
  async acceptBorrowRequest(
    requestId: string,
    ownerId: string,
  ): Promise<{ request: BorrowRequestDocument; listing: ListingDocument }> {
    if (!isValidObjectId(requestId)) {
      throw new BadRequestException(`Invalid request ID format: ${requestId}`);
    }

    const request = await this.borrowRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException(`Borrow request '${requestId}' not found.`);
    }

    if (request.ownerId !== ownerId) {
      throw new ForbiddenException(
        'Only the item owner can accept this borrow request.',
      );
    }

    if (request.status !== BorrowRequestStatus.PENDING) {
      throw new BadRequestException(
        `Cannot accept request with status '${request.status}'.`,
      );
    }

    const listing = await this.findById(request.listingId);
    if (listing.status !== ListingStatus.AVAILABLE) {
      throw new BadRequestException(
        `This item is no longer available (Current status: ${listing.status}).`,
      );
    }

    // 1. Mark this request as ACCEPTED
    request.status = BorrowRequestStatus.ACCEPTED;
    request.acceptedAt = new Date();
    await request.save();

    // 2. Update listing status to BORROWED with borrow details
    listing.status = ListingStatus.BORROWED;
    listing.borrowDetails = {
      borrowerId: request.borrowerId,
      startDate: request.startDate,
      returnDate: request.returnDate,
      notes: request.notes,
    };
    await listing.save();

    // 3. Prevent conflicts: Automatically reject other PENDING requests for this listing
    await this.borrowRequestModel.updateMany(
      {
        listingId: listing._id.toString(),
        _id: { $ne: request._id },
        status: BorrowRequestStatus.PENDING,
      },
      {
        $set: {
          status: BorrowRequestStatus.REJECTED,
          rejectionReason:
            'Another borrow request was accepted for this listing.',
        },
      },
    );

    // ➔ RabbitMQ events
    await this.rabbitMQService.publishEvent('listing.borrow_request.accepted', {
      requestId: request._id,
      listingId: listing._id,
      listingTitle: listing.title,
      ownerId,
      borrowerId: request.borrowerId,
      startDate: request.startDate,
      returnDate: request.returnDate,
    });

    await this.rabbitMQService.publishEvent('listing.borrowed', {
      listingId: listing._id,
      title: listing.title,
      ownerId: listing.ownerId,
      borrowerId: request.borrowerId,
      startDate: request.startDate,
      returnDate: request.returnDate,
    });

    return { request, listing };
  }

  /**
   * Reject a borrow request (Item Owner only)
   */
  async rejectBorrowRequest(
    requestId: string,
    ownerId: string,
    rejectDto?: RejectBorrowRequestDto,
  ): Promise<BorrowRequestDocument> {
    if (!isValidObjectId(requestId)) {
      throw new BadRequestException(`Invalid request ID format: ${requestId}`);
    }

    const request = await this.borrowRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException(`Borrow request '${requestId}' not found.`);
    }

    if (request.ownerId !== ownerId) {
      throw new ForbiddenException(
        'Only the item owner can reject this borrow request.',
      );
    }

    if (request.status !== BorrowRequestStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject request with status '${request.status}'.`,
      );
    }

    request.status = BorrowRequestStatus.REJECTED;
    request.rejectionReason =
      rejectDto?.reason || 'The owner declined the request.';
    const saved = await request.save();

    // ➔ RabbitMQ event
    await this.rabbitMQService.publishEvent('listing.borrow_request.rejected', {
      requestId: saved._id,
      listingId: saved.listingId,
      ownerId,
      borrowerId: saved.borrowerId,
      reason: saved.rejectionReason,
    });

    return saved;
  }

  /**
   * Cancel a pending borrow request (Borrower only)
   */
  async cancelBorrowRequest(
    requestId: string,
    borrowerId: string,
  ): Promise<BorrowRequestDocument> {
    if (!isValidObjectId(requestId)) {
      throw new BadRequestException(`Invalid request ID format: ${requestId}`);
    }

    const request = await this.borrowRequestModel.findById(requestId);
    if (!request) {
      throw new NotFoundException(`Borrow request '${requestId}' not found.`);
    }

    if (request.borrowerId !== borrowerId) {
      throw new ForbiddenException(
        'You can only cancel your own borrow requests.',
      );
    }

    if (request.status !== BorrowRequestStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel request with status '${request.status}'.`,
      );
    }

    request.status = BorrowRequestStatus.CANCELLED;
    return request.save();
  }

  /**
   * Return a borrowed item (owner, borrower, or admin)
   */
  async returnItem(
    id: string,
    userId: string,
    userRoles: string[] = [],
  ): Promise<ListingDocument> {
    const listing = await this.findById(id);

    if (listing.status !== ListingStatus.BORROWED) {
      throw new BadRequestException(
        `This item is not currently marked as BORROWED (Current status: ${listing.status}).`,
      );
    }

    const isOwner = listing.ownerId === userId;
    const isBorrower = listing.borrowDetails?.borrowerId === userId;
    const isAdmin =
      userRoles.includes('ADMIN') || userRoles.includes('ROLE_ADMIN');

    if (!isOwner && !isBorrower && !isAdmin) {
      throw new ForbiddenException(
        'Only the item owner or borrower can mark this item as returned.',
      );
    }

    const returnedAt = new Date();
    listing.status = ListingStatus.AVAILABLE;
    if (listing.borrowDetails) {
      listing.borrowDetails.returnedAt = returnedAt;
    }

    const saved = await listing.save();

    // Update corresponding borrow request if present
    await this.borrowRequestModel.updateMany(
      {
        listingId: id,
        status: BorrowRequestStatus.ACCEPTED,
      },
      {
        $set: {
          status: BorrowRequestStatus.RETURNED,
          returnedAt,
        },
      },
    );

    // ➔ RabbitMQ event
    await this.rabbitMQService.publishEvent('listing.returned', {
      listingId: saved._id,
      title: saved.title,
      ownerId: saved.ownerId,
      borrowerId: listing.borrowDetails?.borrowerId,
      returnedAt,
    });

    return saved;
  }

  /**
   * Legacy direct borrow (maintains backward compatibility with earlier frontend calls)
   */
  async borrow(
    id: string,
    borrowDto: BorrowListingDto,
    borrowerId: string,
  ): Promise<ListingDocument> {
    const effectiveBorrowerId = borrowDto.borrowerId || borrowerId;
    if (!effectiveBorrowerId) {
      throw new BadRequestException('Borrower ID is required.');
    }

    const listing = await this.findById(id);

    if (listing.type !== ListingType.LENDING) {
      throw new BadRequestException(
        `Only items with type 'LENDING' can be borrowed. This item is marked as '${listing.type}'.`,
      );
    }

    if (listing.status !== ListingStatus.AVAILABLE) {
      throw new BadRequestException(
        `This item is currently not available for borrowing (Status: ${listing.status}).`,
      );
    }

    if (listing.ownerId === effectiveBorrowerId) {
      throw new BadRequestException('You cannot borrow your own listing.');
    }

    listing.status = ListingStatus.BORROWED;
    listing.borrowDetails = {
      borrowerId: effectiveBorrowerId,
      startDate: borrowDto.startDate
        ? new Date(borrowDto.startDate)
        : new Date(),
      returnDate: borrowDto.returnDate
        ? new Date(borrowDto.returnDate)
        : undefined,
      notes: borrowDto.notes,
    };

    const saved = await listing.save();

    await this.rabbitMQService.publishEvent('listing.borrowed', {
      listingId: saved._id,
      title: saved.title,
      ownerId: saved.ownerId,
      borrowerId: effectiveBorrowerId,
      startDate: listing.borrowDetails.startDate,
      returnDate: listing.borrowDetails.returnDate,
      notes: listing.borrowDetails.notes,
    });

    return saved;
  }

  // =========================================================================
  // PERSISTENT FAVORITES (MongoDB stored)
  // =========================================================================

  /**
   * Add a listing to user favorites
   */
  async addFavorite(
    listingId: string,
    userId: string,
  ): Promise<{ message: string; listingId: string; isFavorite: boolean }> {
    await this.findById(listingId); // verifies existence

    await this.favoriteModel.updateOne(
      { userId, listingId },
      { $setOnInsert: { userId, listingId, createdAt: new Date() } },
      { upsert: true },
    );

    return {
      message: 'Listing added to favorites.',
      listingId,
      isFavorite: true,
    };
  }

  /**
   * Remove a listing from user favorites
   */
  async removeFavorite(
    listingId: string,
    userId: string,
  ): Promise<{ message: string; listingId: string; isFavorite: boolean }> {
    await this.favoriteModel.deleteOne({ userId, listingId });
    return {
      message: 'Listing removed from favorites.',
      listingId,
      isFavorite: false,
    };
  }

  /**
   * Get all active listings favorited by the current user
   */
  async getUserFavorites(userId: string): Promise<ListingDocument[]> {
    const favorites = await this.favoriteModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .exec();

    const listingIds = favorites.map((f) => f.listingId);
    if (listingIds.length === 0) return [];

    return this.listingModel
      .find({
        _id: { $in: listingIds },
        isDeleted: false,
      })
      .exec();
  }

  /**
   * Get array of favorite listing IDs for fast O(1) checks in frontend
   */
  async getUserFavoriteIds(userId: string): Promise<string[]> {
    const favorites = await this.favoriteModel
      .find({ userId })
      .select('listingId')
      .exec();
    return favorites.map((f) => f.listingId);
  }

  // =========================================================================
  // RATINGS & REVIEWS (For completed transactions)
  // =========================================================================

  /**
   * Leave a review and rating for a completed lending/exchange transaction
   */
  async createReview(
    listingId: string,
    createDto: CreateListingReviewDto,
    reviewer: { userId: string; username?: string },
  ): Promise<ListingReviewDocument> {
    const listing = await this.findById(listingId);

    if (listing.ownerId === reviewer.userId) {
      throw new BadRequestException('You cannot review your own listing.');
    }

    // Check if reviewer already reviewed this listing
    const existing = await this.listingReviewModel.findOne({
      listingId,
      reviewerId: reviewer.userId,
    });

    if (existing) {
      throw new ConflictException(
        'You have already left a review for this transaction.',
      );
    }

    const review = new this.listingReviewModel({
      listingId,
      reviewerId: reviewer.userId,
      reviewerName: reviewer.username || 'Parent User',
      targetUserId: listing.ownerId,
      rating: createDto.rating,
      comment: createDto.comment,
    });

    const saved = await review.save();

    await this.rabbitMQService.publishEvent('listing.review.created', {
      reviewId: saved._id,
      listingId,
      ownerId: listing.ownerId,
      reviewerId: reviewer.userId,
      rating: saved.rating,
    });

    return saved;
  }

  /**
   * Get reviews and average rating for a listing
   */
  async getListingReviews(listingId: string): Promise<{
    listingId: string;
    averageRating: number;
    totalReviews: number;
    reviews: ListingReviewDocument[];
  }> {
    const reviews = await this.listingReviewModel
      .find({ listingId })
      .sort({ createdAt: -1 })
      .exec();

    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? Number(
            (
              reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews
            ).toFixed(1),
          )
        : 0;

    return {
      listingId,
      averageRating,
      totalReviews,
      reviews,
    };
  }

  /**
   * Get RabbitMQ message stream history for live demonstration
   */
  getRabbitMQEvents() {
    return this.rabbitMQService.getRecentEvents();
  }
}
