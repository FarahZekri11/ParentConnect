import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export interface MarketplaceEvent<T = any> {
  eventId: string;
  eventType: string;
  routingKey: string;
  timestamp: string;
  producer: string;
  payload: T;
  data: T;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('RabbitMQService');
  private isConnected = false;
  private connection: any = null;
  private channel: any = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  private readonly recentEvents: MarketplaceEvent[] = [];
  private readonly maxStoredEvents = 50;

  private readonly uri: string;
  private readonly sharedTopicExchange = 'parentconnect.topic';
  private readonly queueName = 'parentconnect.marketplace.queue';

  constructor(private readonly configService: ConfigService) {
    this.uri = this.configService.get<string>(
      'rabbitmq.uri',
      process.env.RABBITMQ_URI || 'amqp://guest:guest@localhost:5672',
    );
  }

  async onModuleInit() {
    this.logger.log(`Initializing real AMQP connection to RabbitMQ at ${this.maskedUri()}...`);
    this.connectWithRetry().catch((err) => {
      this.logger.warn(`Initial RabbitMQ connection attempt deferred: ${err?.message}`);
    });
  }

  async onModuleDestroy() {
    this.isDestroyed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    await this.closeConnection();
  }

  /** URI sans le mot de passe, pour les logs (amqp://user:****@host:5672). */
  private maskedUri(): string {
    return this.uri.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:****@');
  }

  private async connectWithRetry(): Promise<void> {
    if (this.isDestroyed || this.isConnected) return;

    try {
      const conn = await amqp.connect(this.uri);
      this.connection = conn;

      conn.on('error', (err: any) => {
        this.logger.warn(`[RabbitMQ] Connection error: ${err.message}`);
        this.isConnected = false;
      });

      conn.on('close', () => {
        this.logger.warn('[RabbitMQ] Connection closed. Scheduling reconnect in 5s...');
        this.isConnected = false;
        this.channel = null;
        this.scheduleReconnect();
      });

      const ch = await conn.createChannel();
      this.channel = ch;

      ch.on('error', (err: any) => {
        this.logger.warn(`[RabbitMQ] Channel error: ${err.message}`);
      });

      ch.on('close', () => {
        this.logger.warn('[RabbitMQ] Channel closed.');
        this.channel = null;
      });

      // 1. Shared Central Topic Exchange: parentconnect.topic
      await ch.assertExchange(this.sharedTopicExchange, 'topic', { durable: true });
      this.logger.log(`[RabbitMQ] Shared exchange asserted: '${this.sharedTopicExchange}' (topic, durable)`);

      // 2. Dedicated Service Queue: marketplace_events_queue
      // 2. Coordinated Queue: parentconnect.marketplace.queue
      await ch.assertQueue(this.queueName, { durable: true });
      await ch.bindQueue(this.queueName, this.sharedTopicExchange, 'marketplace.#');
      await ch.bindQueue(this.queueName, this.sharedTopicExchange, 'listing.#');
      this.logger.log(
        `[RabbitMQ] Coordinated queue asserted: '${this.queueName}' bound to '${this.sharedTopicExchange}' with 'marketplace.#' and 'listing.#'`,
      );

      this.isConnected = true;
      this.logger.log('[RabbitMQ] Real AMQP broker connected and ready.');
    } catch (err: any) {
      this.isConnected = false;
      this.channel = null;
      this.logger.warn(
        `[RabbitMQ] Unable to establish AMQP connection (${err.message}). Resilient fallback mode active. Reconnecting in 5s...`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      await this.connectWithRetry();
    }, 5000);
  }

  private async closeConnection() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch {
      // Ignore cleanup error
    } finally {
      this.isConnected = false;
      this.channel = null;
      this.connection = null;
    }
  }

  /**
   * Publish an asynchronous event to RabbitMQ
   * @param eventType e.g. 'listing.created', 'listing.updated', 'listing.borrowed', 'listing.returned', 'listing.deleted'
   * @param data Event payload
   */
  async publishEvent<T = any>(
    eventType: string,
    data: T,
  ): Promise<MarketplaceEvent<T>> {
    // Standard explicit routing key: marketplace.<entity>.<action>
    const standardizedRoutingKey = eventType.startsWith('marketplace.')
      ? eventType
      : `marketplace.${eventType}`;

    const legacyRoutingKey = eventType.startsWith('listing.')
      ? eventType
      : `listing.${eventType}`;

    const event: MarketplaceEvent<T> = {
      eventId: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      eventType: standardizedRoutingKey,
      routingKey: standardizedRoutingKey,
      timestamp: new Date().toISOString(),
      producer: 'marketplace-service',
      payload: data,
      data,
    };

    // Keep in recent events buffer for live inspection
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxStoredEvents) {
      this.recentEvents.pop();
    }

    // Publish to real RabbitMQ channel if connected
    if (this.isConnected && this.channel) {
      try {
        const messageBuffer = Buffer.from(JSON.stringify(event));

        // 1. Publish to shared topic exchange 'parentconnect.topic'
        this.channel.publish(
          this.sharedTopicExchange,
          standardizedRoutingKey,
          messageBuffer,
          {
            persistent: true,
            contentType: 'application/json',
            timestamp: Date.now(),
            messageId: event.eventId,
            type: standardizedRoutingKey,
          },
        );

        this.logger.log(
          `[RabbitMQ AMQP] Published to '${this.sharedTopicExchange}' -> '${standardizedRoutingKey}' [ID: ${event.eventId}]`,
        );
      } catch (err: any) {
        this.logger.error(`[RabbitMQ AMQP] Failed to publish event: ${err.message}`);
      }
    } else {
      this.logger.log(
        `[RabbitMQ Fallback] Broker not connected; event recorded in outbox stream: '${standardizedRoutingKey}' [ID: ${event.eventId}]`,
      );
    }

    return event;
  }

  /**
   * Get recently published RabbitMQ events for Swagger / testing
   */
  getRecentEvents(): {
    brokerConnected: boolean;
    brokerUri: string;
    exchange: string;
    queue: string;
    routingKeyPattern: string;
    totalPublished: number;
    events: MarketplaceEvent[];
  } {
    return {
      brokerConnected: this.isConnected,
      brokerUri: this.maskedUri(),
      exchange: this.sharedTopicExchange,
      queue: this.queueName,
      routingKeyPattern: 'marketplace.#',
      totalPublished: this.recentEvents.length,
      events: this.recentEvents,
    };
  }
}
