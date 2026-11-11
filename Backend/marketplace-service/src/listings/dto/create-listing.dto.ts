import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ListingType } from '../enums/listing-type.enum';
import { ItemCondition } from '../enums/item-condition.enum';
import { ItemCategory } from '../enums/item-category.enum';
import { LocationDto } from './location.dto';

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

  @ApiPropertyOptional({ example: 45.0, description: 'Price in EUR (or 0 for donation/free lend)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'EUR', default: 'EUR' })
  @IsOptional()
  @IsString()
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
  @IsString({ each: true })
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
