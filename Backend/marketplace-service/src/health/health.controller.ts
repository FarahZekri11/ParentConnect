import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health Check')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Vérification de santé du microservice (GET /health)' })
  @ApiResponse({ status: 200, description: 'Microservice opérationnel' })
  getHealthRoot() {
    return this.buildHealthResponse();
  }

  @Get('api/health')
  @ApiOperation({ summary: 'Vérification de santé du microservice (GET /api/health)' })
  @ApiResponse({ status: 200, description: 'Microservice opérationnel' })
  getHealthApi() {
    return this.buildHealthResponse();
  }

  private buildHealthResponse() {
    return {
      status: 'UP',
      service: process.env.EUREKA_APP_NAME || process.env.APP_NAME || 'PARENTCONNECT-MARKETPLACE-SERVICE',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
