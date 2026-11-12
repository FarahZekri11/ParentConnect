import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { Listing, ListingSchema } from './schemas/listing.schema';
import {
  BorrowRequest,
  BorrowRequestSchema,
} from './schemas/borrow-request.schema';
import { Favorite, FavoriteSchema } from './schemas/favorite.schema';
import {
  ListingReview,
  ListingReviewSchema,
} from './schemas/listing-review.schema';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UploadsController } from '../uploads/uploads.controller';
import { ImageStorageService } from '../uploads/image-storage.service';
import { AdminStatsController } from './admin-stats.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Listing.name, schema: ListingSchema },
      { name: BorrowRequest.name, schema: BorrowRequestSchema },
      { name: Favorite.name, schema: FavoriteSchema },
      { name: ListingReview.name, schema: ListingReviewSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>(
          'JWT_SECRET',
          'parentconnect_jwt_secret_key',
        ),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  // UploadsController avant ListingsController : /listings/uploads/* est résolu avant /listings/:id
  controllers: [UploadsController, AdminStatsController, ListingsController],
  providers: [ListingsService, JwtAuthGuard, RolesGuard, ImageStorageService],
  exports: [ListingsService],
})
export class ListingsModule {}
