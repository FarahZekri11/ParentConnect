import { Test, TestingModule } from '@nestjs/testing';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ListingType } from './enums/listing-type.enum';
import { ListingStatus } from './enums/listing-status.enum';
import { ItemCategory } from './enums/item-category.enum';
import { ItemCondition } from './enums/item-condition.enum';

describe('ListingsController', () => {
  let controller: ListingsController;
  let service: ListingsService;

  const mockListing = {
    _id: '507f1f77bcf86cd799439011',
    title: 'Transat Bébé',
    description: 'Transat réglable',
    category: ItemCategory.PUERICULTURE,
    condition: ItemCondition.GOOD,
    type: ListingType.DONATION,
    status: ListingStatus.AVAILABLE,
    price: 0,
    ownerId: 'user_1',
  };

  const mockListingsService = {
    create: jest.fn().mockResolvedValue(mockListing),
    findAll: jest.fn().mockResolvedValue({
      listings: [mockListing],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
    findById: jest.fn().mockResolvedValue(mockListing),
    update: jest.fn().mockResolvedValue({ ...mockListing, title: 'Updated' }),
    remove: jest.fn().mockResolvedValue({ message: 'Deleted', id: '507f1f77bcf86cd799439011' }),
    borrow: jest.fn().mockResolvedValue({ ...mockListing, status: ListingStatus.BORROWED }),
    returnItem: jest.fn().mockResolvedValue({ ...mockListing, status: ListingStatus.AVAILABLE }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListingsController],
      providers: [
        {
          provide: ListingsService,
          useValue: mockListingsService,
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    controller = module.get<ListingsController>(ListingsController);
    service = module.get<ListingsService>(ListingsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call service.findAll on GET /listings', async () => {
    const result = await controller.findAll({});
    expect(service.findAll).toHaveBeenCalledWith({});
    expect(result.total).toBe(1);
  });

  it('should call service.findById on GET /listings/:id', async () => {
    const result = await controller.findById('507f1f77bcf86cd799439011');
    expect(service.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(result._id).toBe('507f1f77bcf86cd799439011');
  });

  it('should call service.create on POST /listings with user', async () => {
    const dto = {
      title: 'Transat Bébé',
      description: 'Transat réglable',
      category: ItemCategory.PUERICULTURE,
      condition: ItemCondition.GOOD,
      type: ListingType.DONATION,
    };
    const user = { userId: 'user_1', displayName: 'Marie Laurent' };

    const result = await controller.create(dto, user);
    // Le nom du propriétaire provient de l'identité vérifiée (token / Gateway)
    expect(service.create).toHaveBeenCalledWith(dto, 'user_1', 'Marie Laurent');
    expect(result.title).toBe('Transat Bébé');
  });

  it('should call service.borrow on POST /listings/:id/borrow', async () => {
    const borrowDto = { notes: 'Besoin pour le weekend' };
    const user = { userId: 'user_borrower' };

    const result = await controller.borrow('507f1f77bcf86cd799439011', borrowDto, user);
    expect(service.borrow).toHaveBeenCalledWith('507f1f77bcf86cd799439011', borrowDto, 'user_borrower');
    expect(result.status).toBe(ListingStatus.BORROWED);
  });
});
