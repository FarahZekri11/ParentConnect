import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './config/configuration';
import { ListingsModule } from './listings/listings.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri:
          configService.get<string>('mongodb.uri') ||
          'mongodb://localhost:27017/parentconnect_marketplace',
      }),
      inject: [ConfigService],
    }),
    RabbitMQModule,
    ListingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
