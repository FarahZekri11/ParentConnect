import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ListingType } from '../enums/listing-type.enum';
import { ItemCondition } from '../enums/item-condition.enum';
import { ItemCategory } from '../enums/item-category.enum';
import { LocationDto } from './location.dto';
import { ImageStorageService } from '../../uploads/image-storage.service';

/** Devises acceptées (montant saisi dans la devise choisie, aucune conversion automatique). */
export const SUPPORTED_CURRENCIES = ['TND', 'EUR', 'USD'] as const;

@ValidatorConstraint({ name: 'listingImageUrls', async: false })
class ListingImageUrls implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return Array.isArray(value) && value.every((v) => ImageStorageService.isAcceptedImageUrl(v as string));
  }

  defaultMessage(): string {
    return 'Chaque image doit être une photo téléversée (/api/listings/uploads/...) ou une URL http(s).';
  }
}

export class CreateListingDto {
  @ApiProperty({ example: 'Poussette compacte Yoyo', description: 'Listing title' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  title: string;

  @ApiProperty({
    example: 'Poussette en excellent état, idéale pour voyage en cabine avion ou balades en ville.',
    description: 'Detailed description of the item',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ enum: ItemCategory, example: ItemCategory.STROLLERS, description: 'Item category' })
  @IsNotEmpty()
  @IsEnum(ItemCategory)
  category: ItemCategory;

  @ApiProperty({ enum: ItemCondition, example: ItemCondition.LIKE_NEW, description: 'Item condition' })
  @IsNotEmpty()
  @IsEnum(ItemCondition)
  condition: ItemCondition;

  @ApiProperty({
    enum: ListingType,
    example: ListingType.LENDING,
    description: 'Listing type: DONATION, SALE, LENDING, or EXCHANGE',
  })
  @IsNotEmpty()
  @IsEnum(ListingType)
  type: ListingType;

  @ApiPropertyOptional({ example: 45.0, description: 'Prix dans la devise « currency » (0 pour un don ou un prêt gratuit)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'TND', default: 'EUR', enum: SUPPORTED_CURRENCIES })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES as unknown as string[], { message: 'Devise non prise en charge (TND, EUR ou USD).' })
  currency?: string;

  @ApiPropertyOptional({
    example: 'Échange possible contre chaise haute ou vêtements 18 mois',
    description: 'Preferences when listing type is EXCHANGE',
  })
  @IsOptional()
  @IsString()
  exchangePreferences?: string;

  @ApiPropertyOptional({ example: '0-2 ans', description: 'Recommended age range' })
  @IsOptional()
  @IsString()
  targetAgeRange?: string;

  @ApiPropertyOptional({
    example: ['https://example.com/images/stroller1.jpg'],
    description: 'Image URLs',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: '6 photos maximum par annonce.' })
  @IsString({ each: true })
  @Validate(ListingImageUrls)
  images?: string[];

  @ApiPropertyOptional({
    example: ['poussette', 'yoyo', 'voyage'],
    description: 'Search tags',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: LocationDto, description: 'Location details' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @ApiPropertyOptional({ example: 'family_12345', description: 'Family ID if linked to family profile' })
  @IsOptional()
  @IsString()
  familyId?: string;
}
