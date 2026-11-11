import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class BorrowListingDto {
  @ApiPropertyOptional({
    description: 'ID of the borrower (injected from JWT if authenticated, or provided directly)',
    example: 'user_456',
  })
  @IsOptional()
  @IsString()
  borrowerId?: string;

  @ApiPropertyOptional({
    description: 'Start date of the borrowing period (ISO format)',
    example: '2026-10-06T10:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Expected return date of the borrowed item (ISO format)',
    example: '2026-10-20T18:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  returnDate?: Date;

  @ApiPropertyOptional({
    description: 'Note or message for the lender',
    example: 'Merci beaucoup ! Nous en prendrons grand soin pour notre voyage.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
