import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';

async function bootstrap() {
  const logger = new Logger('MarketplaceBootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 8080);
  const keycloakUrl = configService.get<string>(
    'keycloak.url',
    'http://localhost:8180',
  );
  const keycloakRealm = configService.get<string>(
    'keycloak.realm',
    'parentconnect',
  );

  // Global API Prefix -> /api (Health endpoints public at /health and /api/health)
  app.setGlobalPrefix('api', { exclude: ['health', 'api/health'] });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Enable CORS
  app.enableCors();

  // Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('ParentConnect - Marketplace Service API')
    .setDescription(
      `Microservice dédié à l'entraide parentale : annonces de matériel bébé, dons, ventes, prêts, échanges et emprunts.
      \n\n**Architecture & Sécurité :**
      \n- **Service Discovery** : Enregistré sur Eureka (port 8761) sous le nom \`PARENTCONNECT-MARKETPLACE-SERVICE\`
      \n- **API Gateway** : Routé via Gateway centrale (port 8080)
      \n- **Sécurisation Keycloak** : Resource Server OAuth2 / OpenID Connect (Realm: \`${keycloakRealm}\`, URL: \`${keycloakUrl}\`)
      \n- **Messagerie Asynchrone RabbitMQ** : Broker AMQP sur port 5672 (Exchange: \`parentconnect.topic\`, Queue: \`marketplace_events_queue\`)`,
    )
    .setVersion('1.0')
    .addTag('Marketplace Listings', 'Opérations CRUD et cycle de vie des annonces')
    .addTag('Health Check', 'Sonde de santé')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT (Keycloak)',
        name: 'Authorization',
        description:
          'Entrez votre jeton JWT Keycloak (Bearer <token>) ou utilisez les en-têtes de passerelle x-user-id / x-gateway-auth',
        in: 'header',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port, '0.0.0.0');
  logger.log(
    `🚀 Marketplace Microservice is listening on 0.0.0.0:${port} (API: /api, Health: /api/health & /health)`,
  );
  logger.log(
    `📖 Swagger API Documentation is available at http://localhost:${port}/api/docs`,
  );
  logger.log(
    `🔐 Keycloak Resource Server protection enabled (Realm: ${keycloakRealm})`,
  );

  // Register with Eureka Service Discovery
  registerWithEureka(configService, port, logger);
}

/**
 * Self-registration and heartbeat loop with Eureka Discovery Server
 */
function registerWithEureka(
  configService: ConfigService,
  port: number,
  logger: Logger,
) {
  const eurekaHost = configService.get<string>('eureka.host', 'eureka-server');
  const eurekaPort = configService.get<number>('eureka.port', 8761);
  const servicePath = configService.get<string>(
    'eureka.servicePath',
    '/eureka/apps/',
  );
  const appName = configService.get<string>(
    'eureka.appName',
    'PARENTCONNECT-MARKETPLACE-SERVICE',
  );
  const instanceHost =
    process.env.MARKETPLACE_HOST ||
    process.env.HOSTNAME ||
    'host.docker.internal';

  const payload = JSON.stringify({
    instance: {
      instanceId: `${appName.toLowerCase()}:${port}`,
      hostName: instanceHost,
      app: appName,
      vipAddress: appName.toLowerCase(),
      secureVipAddress: appName.toLowerCase(),
      ipAddr: process.env.MARKETPLACE_IP || instanceHost,
      status: 'UP',
      port: { $: port, '@enabled': 'true' },
      homePageUrl: `http://${instanceHost}:${port}/api`,
      statusPageUrl: `http://${instanceHost}:${port}/api/docs`,
      healthCheckUrl: `http://${instanceHost}:${port}/api/health`,
      dataCenterInfo: {
        '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
        name: 'MyOwn',
      },
    },
  });

  const sendRegistration = () => {
    const req = http.request(
      {
        hostname: eurekaHost,
        port: eurekaPort,
        path: `${servicePath}${appName}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode < 300) {
          logger.log(
            `[Eureka Discovery] Registered with Eureka Server on http://${eurekaHost}:${eurekaPort} as '${appName}'`,
          );
        }
      },
    );

    req.on('error', () => {
      // Eureka server might not be running yet; will retry periodically
    });

    req.write(payload);
    req.end();
  };

  // Initial registration + heartbeat every 30s
  sendRegistration();
  setInterval(() => {
    const heartbeatReq = http.request(
      {
        hostname: eurekaHost,
        port: eurekaPort,
        path: `${servicePath}${appName}/${appName.toLowerCase()}:${port}`,
        method: 'PUT',
      },
      (res) => {
        if (res.statusCode === 404) {
          // Eureka server restarted or lease expired; re-register immediately
          logger.warn(
            `[Eureka Discovery] Instance not found during heartbeat (404). Re-registering with Eureka...`,
          );
          sendRegistration();
        }
      },
    );
    heartbeatReq.on('error', () => {});
    heartbeatReq.end();
  }, 30000);
}

bootstrap();
