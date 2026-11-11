import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { QueryListingsDto } from './dto/query-listings.dto';
import { BorrowListingDto } from './dto/borrow-listing.dto';
import {
  CreateBorrowRequestDto,
  RejectBorrowRequestDto,
} from './dto/borrow-request.dto';
import { CreateListingReviewDto } from './dto/listing-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('Marketplace Listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  /**
   * CREATE LISTING
   * POST /api/listings
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'ADMIN', 'PARENT', 'PROFESSIONAL')
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-user-id',
    required: false,
    description: 'User ID forwarded by the API Gateway',
  })
  @ApiOperation({
    summary: 'Create a new marketplace listing (Keycloak Protected)',
    description:
      'Allows an authenticated parent (role USER or ADMIN) to offer an item (donation, sale, lending, or exchange). Emits a listing.created event to RabbitMQ.',
  })
  @ApiResponse({ status: 201, description: 'Listing created successfully and event published to RabbitMQ.' })
  @ApiResponse({ status: 400, description: 'Invalid listing input or price rule violated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Keycloak token or Gateway user header required.' })
  async create(
    @Body() createDto: CreateListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.create(createDto, user?.userId);
  }

  /**
   * GET ALL / SEARCH / FILTER LISTINGS
   * GET /api/listings
   */
  @Get()
  @ApiOperation({
    summary: 'Search and filter marketplace listings',
    description:
      'Public endpoint to query listings by keyword, type, category, condition, price, and location with pagination.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of matching listings with pagination metadata.',
  })
  async findAll(@Query() query: QueryListingsDto) {
    return this.listingsService.findAll(query);
  }

  /**
   * GET RABBITMQ EVENTS STREAM
   * GET /api/listings/events/rabbitmq
   */
  @Get('events/rabbitmq')
  @ApiOperation({
    summary: 'Inspect asynchronous RabbitMQ event bus stream',
    description:
      'Returns the list of asynchronous domain events published to the RabbitMQ exchange (listing.created, listing.borrowed, listing.returned, listing.deleted).',
  })
  @ApiResponse({
    status: 200,
    description: 'RabbitMQ broker status and recent message stream.',
  })
  getRabbitMQEvents() {
    return this.listingsService.getRabbitMQEvents();
  }

  // =========================================================================
  // FAVORITES (Persistent MongoDB)
  // Note: Placed before :id to prevent route clash
  // =========================================================================

  @Get('user/favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all favorite listings of the current user (Keycloak Protected)',
  })
  @ApiResponse({ status: 200, description: 'List of favorited listings.' })
  async getUserFavorites(@CurrentUser() user: AuthenticatedUser) {
    return this.listingsService.getUserFavorites(user?.userId);
  }

  @Get('user/favorites/ids')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get array of favorite listing IDs for the current user',
  })
  @ApiResponse({ status: 200, description: 'Array of favorite listing IDs.' })
  async getUserFavoriteIds(@CurrentUser() user: AuthenticatedUser) {
    return this.listingsService.getUserFavoriteIds(user?.userId);
  }

  // =========================================================================
  // BORROW REQUESTS WORKFLOW (Lists & Actions)
  // Note: Placed before :id to prevent route clash
  // =========================================================================

  @Get('borrow-requests/my-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all borrow requests submitted by the current user',
  })
  async getMyBorrowRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.listingsService.getMyBorrowRequests(user?.userId);
  }

  @Get('borrow-requests/incoming')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all incoming borrow requests for items owned by current user',
  })
  async getIncomingBorrowRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.listingsService.getIncomingBorrowRequests(user?.userId);
  }

  @Post('borrow-requests/:requestId/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Accept a borrow request (Owner only). Auto-rejects conflicting requests.',
  })
  @ApiParam({ name: 'requestId', description: 'ID of the borrow request' })
  async acceptBorrowRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.acceptBorrowRequest(requestId, user?.userId);
  }

  @Post('borrow-requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reject a borrow request (Owner only)',
  })
  @ApiParam({ name: 'requestId', description: 'ID of the borrow request' })
  async rejectBorrowRequest(
    @Param('requestId') requestId: string,
    @Body() rejectDto: RejectBorrowRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.rejectBorrowRequest(
      requestId,
      user?.userId,
      rejectDto,
    );
  }

  @Post('borrow-requests/:requestId/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel a pending borrow request (Borrower only)',
  })
  @ApiParam({ name: 'requestId', description: 'ID of the borrow request' })
  async cancelBorrowRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.cancelBorrowRequest(requestId, user?.userId);
  }

  // =========================================================================
  // LISTING BY ID & ITEM ACTIONS
  // =========================================================================

  /**
   * GET LISTING BY ID
   * GET /api/listings/:id
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get listing details by ID',
    description: 'Retrieve full details of an active marketplace listing.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  @ApiResponse({ status: 200, description: 'Listing found.' })
  @ApiResponse({ status: 400, description: 'Invalid listing ID format.' })
  @ApiResponse({ status: 404, description: 'Listing not found.' })
  async findById(@Param('id') id: string) {
    return this.listingsService.findById(id);
  }

  /**
   * UPDATE LISTING
   * PUT /api/listings/:id
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-user-id',
    required: false,
    description: 'User ID forwarded by the API Gateway',
  })
  @ApiOperation({
    summary: 'Update an existing listing (Keycloak Protected)',
    description:
      'Update listing details. Restricted to the listing owner or Keycloak ADMIN. Emits listing.updated to RabbitMQ.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  @ApiResponse({ status: 200, description: 'Listing updated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the owner.' })
  @ApiResponse({ status: 404, description: 'Listing not found.' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.update(
      id,
      updateDto,
      user?.userId,
      user?.roles,
    );
  }

  /**
   * DELETE LISTING
   * DELETE /api/listings/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-user-id',
    required: false,
    description: 'User ID forwarded by the API Gateway',
  })
  @ApiOperation({
    summary: 'Delete (archive) a listing (Keycloak Protected)',
    description:
      'Performs a soft delete of the listing. Restricted to the listing owner or Keycloak ADMIN. Emits listing.deleted to RabbitMQ.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  @ApiResponse({ status: 200, description: 'Listing deleted successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the owner.' })
  @ApiResponse({ status: 404, description: 'Listing not found.' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.remove(id, user?.userId, user?.roles);
  }

  /**
   * BORROW REQUEST FOR SPECIFIC LISTING
   * POST /api/listings/:id/borrow-requests
   */
  @Post(':id/borrow-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit a borrowing request for a lending item (Keycloak Protected)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  async createBorrowRequest(
    @Param('id') id: string,
    @Body() createDto: CreateBorrowRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.createBorrowRequest(id, createDto, {
      userId: user?.userId,
      username: user?.username,
      email: user?.email,
    });
  }

  /**
   * GET BORROW REQUESTS FOR SPECIFIC LISTING
   * GET /api/listings/:id/borrow-requests
   */
  @Get(':id/borrow-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all borrow requests for this listing (Owner only)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  async getListingBorrowRequests(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.getListingBorrowRequests(
      id,
      user?.userId,
      user?.roles,
    );
  }

  /**
   * ADD TO FAVORITES
   * POST /api/listings/:id/favorite
   */
  @Post(':id/favorite')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add listing to user favorites (Keycloak Protected)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  async addFavorite(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.addFavorite(id, user?.userId);
  }

  /**
   * REMOVE FROM FAVORITES
   * DELETE /api/listings/:id/favorite
   */
  @Delete(':id/favorite')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove listing from user favorites (Keycloak Protected)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  async removeFavorite(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.removeFavorite(id, user?.userId);
  }

  /**
   * ADD REVIEW & RATING
   * POST /api/listings/:id/reviews
   */
  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add review and rating for completed transaction (Keycloak Protected)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  async createReview(
    @Param('id') id: string,
    @Body() createDto: CreateListingReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.createReview(id, createDto, {
      userId: user?.userId,
      username: user?.username,
    });
  }

  /**
   * GET REVIEWS & RATING
   * GET /api/listings/:id/reviews
   */
  @Get(':id/reviews')
  @ApiOperation({
    summary: 'Get all reviews and average rating for a listing',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  async getListingReviews(@Param('id') id: string) {
    return this.listingsService.getListingReviews(id);
  }

  /**
   * DIRECT BORROW LISTING (Backward compatibility)
   * POST /api/listings/:id/borrow
   */
  @Post(':id/borrow')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Direct borrow an item on loan (Keycloak Protected)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  async borrow(
    @Param('id') id: string,
    @Body() borrowDto: BorrowListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.borrow(id, borrowDto, user?.userId);
  }

  /**
   * RETURN BORROWED ITEM
   * POST /api/listings/:id/return
   */
  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Return a borrowed item (Keycloak Protected)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the listing' })
  async returnItem(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listingsService.returnItem(id, user?.userId, user?.roles);
  }
}
