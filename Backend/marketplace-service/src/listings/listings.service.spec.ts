import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ListingsService } from './listings.service';
import { Listing } from './schemas/listing.schema';
import {
  BorrowRequest,
  BorrowRequestStatus,
} from './schemas/borrow-request.schema';
import { Favorite } from './schemas/favorite.schema';
import { ListingReview } from './schemas/listing-review.schema';
import { ListingType } from './enums/listing-type.enum';
import { ListingStatus } from './enums/listing-status.enum';
import { ItemCategory } from './enums/item-category.enum';
import { ItemCondition } from './enums/item-condition.enum';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';

describe('ListingsService', () => {
  let service: ListingsService;
  let mockListingModel: any;
  let mockBorrowRequestModel: any;
  let mockFavoriteModel: any;
  let mockListingReviewModel: any;
  let mockRabbitMQService: any;

  const validListingId = '507f1f77bcf86cd799439011';
  const validRequestId = '507f1f77bcf86cd799439022';
  const ownerUserId = 'owner_user_123';
  const borrowerUserId = 'borrower_user_456';

  const sampleListing = {
    _id: validListingId,
    title: 'Poussette Compacte',
    description: 'Poussette en excellent etat',
    category: ItemCategory.STROLLERS,
    condition: ItemCondition.LIKE_NEW,
    type: ListingType.LENDING,
    status: ListingStatus.AVAILABLE,
    price: 0,
    ownerId: ownerUserId,
    isDeleted: false,
    save: jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    }),
  };

  beforeEach(async () => {
    function MockListingConstructor(dto: any) {
      return {
        ...dto,
        _id: validListingId,
        save: jest.fn().mockResolvedValue({
          ...dto,
          _id: validListingId,
        }),
      };
    }
    MockListingConstructor.find = jest.fn();
    MockListingConstructor.findOne = jest.fn();
    MockListingConstructor.findById = jest.fn();
    MockListingConstructor.countDocuments = jest.fn();
    mockListingModel = MockListingConstructor;

    function MockBorrowRequestConstructor(dto: any) {
      return {
        ...dto,
        _id: validRequestId,
        save: jest.fn().mockResolvedValue({
          ...dto,
          _id: validRequestId,
        }),
      };
    }
    MockBorrowRequestConstructor.find = jest.fn();
    MockBorrowRequestConstructor.findOne = jest.fn();
    MockBorrowRequestConstructor.findById = jest.fn();
    MockBorrowRequestConstructor.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    mockBorrowRequestModel = MockBorrowRequestConstructor;

    mockFavoriteModel = {
      updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ listingId: validListingId }]),
        }),
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ listingId: validListingId }]),
        }),
      }),
    };

    function MockReviewConstructor(dto: any) {
      return {
        ...dto,
        _id: 'rev_123',
        save: jest.fn().mockResolvedValue({ ...dto, _id: 'rev_123' }),
      };
    }
    MockReviewConstructor.findOne = jest.fn();
    MockReviewConstructor.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });
    mockListingReviewModel = MockReviewConstructor;

    mockRabbitMQService = {
      publishEvent: jest.fn().mockResolvedValue({}),
      getRecentEvents: jest.fn().mockReturnValue({ events: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingsService,
        { provide: getModelToken(Listing.name), useValue: mockListingModel },
        {
          provide: getModelToken(BorrowRequest.name),
          useValue: mockBorrowRequestModel,
        },
        {
          provide: getModelToken(Favorite.name),
          useValue: mockFavoriteModel,
        },
        {
          provide: getModelToken(ListingReview.name),
          useValue: mockListingReviewModel,
        },
        { provide: RabbitMQService, useValue: mockRabbitMQService },
      ],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a DONATION listing with price forced to 0', async () => {
      const dto = {
        title: 'Bavoirs coton',
        description: 'Lot de 5 bavoirs propres',
        category: ItemCategory.CLOTHING,
        condition: ItemCondition.GOOD,
        type: ListingType.DONATION,
        price: 25,
      };

      const result = await service.create(dto as any, ownerUserId);
      expect(result.price).toBe(0);
      expect(result.ownerId).toBe(ownerUserId);
      expect(result.status).toBe(ListingStatus.AVAILABLE);
      expect(mockRabbitMQService.publishEvent).toHaveBeenCalledWith(
        'listing.created',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException if SALE listing has 0 or negative price', async () => {
      const dto = {
        title: 'Lit a barreaux',
        description: 'Lit en bois massif',
        category: ItemCategory.FURNITURE,
        condition: ItemCondition.LIKE_NEW,
        type: ListingType.SALE,
        price: 0,
      };

      await expect(service.create(dto as any, ownerUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findById', () => {
    it('should return listing when found', async () => {
      mockListingModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleListing),
      });

      const result = await service.findById(validListingId);
      expect(result).toBeDefined();
      expect(result.title).toBe('Poussette Compacte');
    });

    it('should throw NotFoundException if listing not found', async () => {
      mockListingModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findById(validListingId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Borrow Requests Workflow & Conflict Prevention', () => {
    it('should create a PENDING borrow request and emit RabbitMQ event', async () => {
      mockListingModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...sampleListing }),
      });
      mockBorrowRequestModel.findOne.mockResolvedValue(null);

      const requestDto = {
        startDate: '2026-11-20T10:00:00.000Z',
        returnDate: '2026-11-25T18:00:00.000Z',
        notes: 'Pret pour un voyage',
      };

      const result = await service.createBorrowRequest(
        validListingId,
        requestDto as any,
        { userId: borrowerUserId, username: 'Borrower' },
      );

      expect(result.status).toBe(BorrowRequestStatus.PENDING);
      expect(result.borrowerId).toBe(borrowerUserId);
      expect(mockRabbitMQService.publishEvent).toHaveBeenCalledWith(
        'listing.borrow_request.created',
        expect.any(Object),
      );
    });

    it('should reject borrow request creation if owner tries to borrow own listing', async () => {
      mockListingModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...sampleListing, ownerId: ownerUserId }),
      });

      await expect(
        service.createBorrowRequest(
          validListingId,
          { startDate: '2026-11-20T10:00:00.000Z' } as any,
          { userId: ownerUserId },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept a borrow request, mark listing as BORROWED, and auto-reject conflicting pending requests', async () => {
      const mockRequest = {
        _id: validRequestId,
        listingId: validListingId,
        borrowerId: borrowerUserId,
        ownerId: ownerUserId,
        status: BorrowRequestStatus.PENDING,
        startDate: new Date('2026-11-20'),
        returnDate: new Date('2026-11-25'),
        save: jest.fn().mockResolvedValue(this),
      };

      const mockListing = {
        ...sampleListing,
        status: ListingStatus.AVAILABLE,
        save: jest.fn().mockResolvedValue(this),
      };

      mockBorrowRequestModel.findById.mockResolvedValue(mockRequest);
      mockListingModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockListing),
      });

      const result = await service.acceptBorrowRequest(validRequestId, ownerUserId);

      expect(mockRequest.status).toBe(BorrowRequestStatus.ACCEPTED);
      expect(mockListing.status).toBe(ListingStatus.BORROWED);
      // Conflict prevention verification:
      expect(mockBorrowRequestModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          listingId: validListingId,
          status: BorrowRequestStatus.PENDING,
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: BorrowRequestStatus.REJECTED,
          }),
        }),
      );
      expect(mockRabbitMQService.publishEvent).toHaveBeenCalledWith(
        'listing.borrow_request.accepted',
        expect.any(Object),
      );
    });
  });

  describe('Persistent Favorites', () => {
    it('should add listing to favorites using MongoDB upsert', async () => {
      mockListingModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleListing),
      });

      const result = await service.addFavorite(validListingId, borrowerUserId);
      expect(result.isFavorite).toBe(true);
      expect(mockFavoriteModel.updateOne).toHaveBeenCalledWith(
        { userId: borrowerUserId, listingId: validListingId },
        expect.any(Object),
        { upsert: true },
      );
    });

    it('should remove listing from favorites', async () => {
      const result = await service.removeFavorite(validListingId, borrowerUserId);
      expect(result.isFavorite).toBe(false);
      expect(mockFavoriteModel.deleteOne).toHaveBeenCalledWith({
        userId: borrowerUserId,
        listingId: validListingId,
      });
    });
  });

  describe('Reviews and Ratings', () => {
    it('should save a review and publish event', async () => {
      mockListingModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleListing),
      });
      mockListingReviewModel.findOne.mockResolvedValue(null);

      const reviewDto = {
        rating: 5,
        comment: 'Superbe poussette, tout s est tres bien passe !',
      };

      const result = await service.createReview(validListingId, reviewDto, {
        userId: borrowerUserId,
        username: 'ParentTest',
      });

      expect(result.rating).toBe(5);
      expect(mockRabbitMQService.publishEvent).toHaveBeenCalledWith(
        'listing.review.created',
        expect.any(Object),
      );
    });

    it('should prevent owner from reviewing their own listing', async () => {
      mockListingModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...sampleListing, ownerId: ownerUserId }),
      });

      await expect(
        service.createReview(
          validListingId,
          { rating: 5, comment: 'Super' },
          { userId: ownerUserId },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
