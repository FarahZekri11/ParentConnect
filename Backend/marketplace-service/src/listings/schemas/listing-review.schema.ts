import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ListingReviewDocument = ListingReview & Document;

@Schema({ timestamps: true })
export class ListingReview {
  @Prop({ required: true, type: String, index: true })
  listingId: string;

  @Prop({ required: true, type: String, index: true })
  reviewerId: string;

  @Prop({ type: String, trim: true })
  reviewerName?: string;

  @Prop({ required: true, type: String, index: true })
  targetUserId: string;

  @Prop({ required: true, type: Number, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  comment: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ListingReviewSchema = SchemaFactory.createForClass(ListingReview);

// One review per reviewer per listing
ListingReviewSchema.index({ listingId: 1, reviewerId: 1 }, { unique: true });
ListingReviewSchema.index({ targetUserId: 1, createdAt: -1 });
ListingReviewSchema.index({ listingId: 1, createdAt: -1 });
