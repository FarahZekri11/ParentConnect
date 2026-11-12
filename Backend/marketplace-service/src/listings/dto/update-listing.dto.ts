import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { ListingStatus } from '../enums/listing-status.enum';

export class UpdateListingDto extends PartialType(CreateListingDto) {
  @ApiPropertyOptional({
    enum: ListingStatus,
    example: ListingStatus.AVAILABLE,
    description: 'Current status of listing',
  })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}
