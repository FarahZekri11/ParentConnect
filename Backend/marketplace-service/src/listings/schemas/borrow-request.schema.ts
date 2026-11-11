import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type BorrowRequestDocument = BorrowRequest & Document;

export enum BorrowRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

@Schema({ timestamps: true })
export class BorrowRequest {
  @Prop({ required: true, type: String, index: true })
  listingId: string;

  @Prop({ required: true, type: String, index: true })
  borrowerId: string;

  @Prop({ type: String, trim: true })
  borrowerName?: string;

  @Prop({ type: String, trim: true })
  borrowerEmail?: string;

  @Prop({ required: true, type: String, index: true })
  ownerId: string;

  @Prop({ required: true, type: Date })
  startDate: Date;

  @Prop({ type: Date, required: false })
  returnDate?: Date;

  @Prop({ type: String, trim: true, maxlength: 1000 })
  notes?: string;

  @Prop({
    required: true,
    enum: BorrowRequestStatus,
    default: BorrowRequestStatus.PENDING,
    index: true,
  })
  status: BorrowRequestStatus;

  @Prop({ type: String, trim: true })
  rejectionReason?: string;

  @Prop({ type: Date })
  acceptedAt?: Date;

  @Prop({ type: Date })
  returnedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BorrowRequestSchema = SchemaFactory.createForClass(BorrowRequest);

// Compound indexes to prevent conflicting active requests and optimize querying
BorrowRequestSchema.index({ listingId: 1, status: 1 });
BorrowRequestSchema.index({ borrowerId: 1, status: 1 });
BorrowRequestSchema.index({ ownerId: 1, status: 1 });
BorrowRequestSchema.index({ createdAt: -1 });
