import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

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
  @IsNumber({}, { each: true })
  coordinates?: number[];
}
