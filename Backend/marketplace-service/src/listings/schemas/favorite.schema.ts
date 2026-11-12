import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FavoriteDocument = Favorite & Document;

@Schema({ timestamps: true })
export class Favorite {
  @Prop({ required: true, type: String, index: true })
  userId: string;

  @Prop({ required: true, type: String, index: true })
  listingId: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite);

// Ensure a user can only favorite a listing once (compound unique index)
FavoriteSchema.index({ userId: 1, listingId: 1 }, { unique: true });
FavoriteSchema.index({ userId: 1, createdAt: -1 });
