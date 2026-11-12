import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** [longitude, latitude] dans les bornes terrestres (sinon l'index 2dsphere refuserait l'écriture). */
@ValidatorConstraint({ name: 'lngLatPair', async: false })
class LngLatPair implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value) || value.length !== 2) return false;
    const [lng, lat] = value as number[];
    return Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
  }

  defaultMessage(): string {
    return 'coordinates doit valoir [longitude, latitude] (longitude -180..180, latitude -90..90).';
  }
}

export class LocationDto {
  @ApiPropertyOptional({ example: 'Paris', description: 'City name' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '75011', description: 'Postal code' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Bastille', description: 'Neighborhood / Quartier' })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({
    example: [2.37, 48.85],
    description: '[longitude, latitude] coordinates',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  @Validate(LngLatPair)
  coordinates?: number[];
}
