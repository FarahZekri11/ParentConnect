package com.parentconnect.rabbitmq.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration Spring AMQP pour RabbitMQ:
 * - TopicExchange: 'parentconnect.marketplace.exchange'
 * - Queue: 'parentconnect.marketplace.queue'
 * - Binding: routing-key 'listing.*'
 * - MessageConverter: Jackson JSON converter pour sérialiser/désérialiser les objets DTO
 */
@Configuration
public class RabbitMQConfig {

    @Value("${parentconnect.rabbitmq.exchange:parentconnect.topic}")
    private String exchangeName;

    @Value("${parentconnect.rabbitmq.queue:parentconnect.marketplace.queue}")
    private String queueName;

    @Value("${parentconnect.rabbitmq.routing-key:marketplace.#}")
    private String routingKey;

    @Bean
    public TopicExchange marketplaceExchange() {
        return new TopicExchange(exchangeName, true, false);
    }

    @Bean
    public Queue marketplaceQueue() {
        return QueueBuilder.durable(queueName).build();
    }

    @Bean
    public Binding marketplaceBinding(Queue marketplaceQueue, TopicExchange marketplaceExchange) {
        return BindingBuilder
                .bind(marketplaceQueue)
                .to(marketplaceExchange)
                .with(routingKey);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public AmqpTemplate amqpTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(jsonMessageConverter());
        return rabbitTemplate;
    }
}
