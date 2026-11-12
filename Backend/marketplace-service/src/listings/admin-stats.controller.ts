import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ListingsService } from './listings.service';

/** GET /api/listings/admin/stats — statistiques du module (ADMIN). */
@ApiTags('Marketplace Listings')
@Controller('listings/admin')
export class AdminStatsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Statistiques du Marketplace (ADMIN)' })
  stats() {
    return this.listingsService.stats();
  }
}
