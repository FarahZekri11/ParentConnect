export default () => {
  const eurekaServerUrl =
    process.env.EUREKA_SERVER_URL ||
    `http://${process.env.EUREKA_HOST || 'eureka-server'}:${process.env.EUREKA_PORT || '8761'}/eureka/`;

  let parsedEurekaHost = process.env.EUREKA_HOST || 'eureka-server';
  let parsedEurekaPort = parseInt(process.env.EUREKA_PORT || '8761', 10);
  let parsedEurekaPath = '/eureka/apps/';

  try {
    const parsed = new URL(eurekaServerUrl);
    parsedEurekaHost = parsed.hostname;
    parsedEurekaPort = parseInt(parsed.port || '8761', 10);
    parsedEurekaPath = parsed.pathname.endsWith('/')
      ? `${parsed.pathname}apps/`
      : `${parsed.pathname}/apps/`;
  } catch {
    // fallback to defaults
  }

  const rabbitHost = process.env.RABBITMQ_HOST || 'rabbitmq';
  const rabbitPort = process.env.RABBITMQ_PORT || '5672';
  const rabbitUser = process.env.RABBITMQ_USER || process.env.RABBITMQ_DEFAULT_USER || 'guest';
  const rabbitPass = process.env.RABBITMQ_PASS || process.env.RABBITMQ_DEFAULT_PASS || 'guest';
  const rabbitUri =
    process.env.RABBITMQ_URI ||
    `amqp://${rabbitUser}:${rabbitPass}@${rabbitHost}:${rabbitPort}`;

  return {
    port: parseInt(process.env.PORT || process.env.APP_PORT || '8080', 10),
    mongodb: {
      uri:
        process.env.MONGODB_URI ||
        'mongodb://localhost:27017/parentconnect_marketplace',
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'parentconnect_jwt_secret_key',
    },
    keycloak: {
      url: process.env.KEYCLOAK_URL || 'http://localhost:8180',
      realm: process.env.KEYCLOAK_REALM || 'parentconnect',
      clientId: process.env.KEYCLOAK_CLIENT_ID || 'marketplace-service',
      realmPublicKey: process.env.KEYCLOAK_REALM_PUBLIC_KEY || '',
    },
    rabbitmq: {
      host: rabbitHost,
      port: parseInt(rabbitPort, 10),
      uri: rabbitUri,
      exchange: process.env.RABBITMQ_EXCHANGE || 'parentconnect.topic',
      queue: process.env.RABBITMQ_QUEUE || 'marketplace_events_queue',
    },
    eureka: {
      serverUrl: eurekaServerUrl,
      host: parsedEurekaHost,
      port: parsedEurekaPort,
      servicePath: parsedEurekaPath,
      appName:
        process.env.EUREKA_APP_NAME ||
        process.env.APP_NAME ||
        'PARENTCONNECT-MARKETPLACE-SERVICE',
    },
  };
};
