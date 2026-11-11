import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBorrowRequestDto {
  @ApiProperty({
    description: 'Requested start date for borrowing (ISO format)',
    example: '2026-11-15T10:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({
    description: 'Requested return date for borrowing (ISO format)',
    example: '2026-11-20T18:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @ApiPropertyOptional({
    description: 'Optional note or message to the item owner',
    example: 'Bonjour Farah, j aimerais emprunter la poussette pour le week-end.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RejectBorrowRequestDto {
  @ApiPropertyOptional({
    description: 'Reason for rejecting the borrow request',
    example: 'L article est deja promis pour ce week-end.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
