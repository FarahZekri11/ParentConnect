import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ListingType } from '../enums/listing-type.enum';
import { ListingStatus } from '../enums/listing-status.enum';
import { ItemCondition } from '../enums/item-condition.enum';
import { ItemCategory } from '../enums/item-category.enum';

export type ListingDocument = Listing & Document;

@Schema({ _id: false })
export class LocationDetails {
  @Prop({ type: String, trim: true })
  city?: string;

  @Prop({ type: String, trim: true })
  postalCode?: string;

  @Prop({ type: String, trim: true })
  neighborhood?: string;

  @Prop({ type: [Number], index: '2dsphere', required: false })
  coordinates?: number[]; // [longitude, latitude]
}

@Schema({ _id: false })
export class BorrowDetails {
  @Prop({ type: String, required: true })
  borrowerId: string;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: false })
  returnDate?: Date;

  @Prop({ type: Date, required: false })
  returnedAt?: Date;

  @Prop({ type: String, trim: true, required: false })
  notes?: string;
}

@Schema({ timestamps: true })
export class Listing {
  @Prop({ required: true, trim: true, maxlength: 150 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  description: string;

  @Prop({ required: true, enum: ItemCategory, index: true })
  category: ItemCategory;

  @Prop({ required: true, enum: ItemCondition })
  condition: ItemCondition;

  @Prop({ required: true, enum: ListingType, index: true })
  type: ListingType;

  @Prop({ required: true, enum: ListingStatus, default: ListingStatus.AVAILABLE, index: true })
  status: ListingStatus;

  @Prop({ type: Number, min: 0, default: 0 })
  price: number;

  @Prop({ type: String, default: 'EUR' })
  currency: string;

  @Prop({ type: String, trim: true })
  exchangePreferences?: string;

  @Prop({ type: String, trim: true })
  targetAgeRange?: string; // e.g. "0-6m", "6-12m", "1-3y"

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: LocationDetails, default: {} })
  location: LocationDetails;

  @Prop({ required: true, type: String, index: true })
  ownerId: string;

  /** Nom affiché du propriétaire, issu du token vérifié (absent sur les annonces antérieures) */
  @Prop({ type: String, trim: true, maxlength: 120 })
  ownerName?: string;

  @Prop({ type: String, index: true })
  familyId?: string;

  @Prop({ type: BorrowDetails, required: false })
  borrowDetails?: BorrowDetails;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ListingSchema = SchemaFactory.createForClass(Listing);

// Indexes
ListingSchema.index({ title: 'text', description: 'text', tags: 'text' });
ListingSchema.index({ status: 1, type: 1, category: 1, createdAt: -1 });
ListingSchema.index({ 'location.city': 1, 'location.postalCode': 1 });
ListingSchema.index({ ownerId: 1, isDeleted: 1 });
