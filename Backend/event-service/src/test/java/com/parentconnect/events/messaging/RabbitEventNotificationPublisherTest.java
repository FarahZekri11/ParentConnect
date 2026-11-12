package com.parentconnect.events.messaging;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RabbitEventNotificationPublisherTest {

    @Test
    void publishesJsonMessageOnSharedTopicExchangeWithExplicitRoutingKey() {
        RabbitTemplate template = mock(RabbitTemplate.class);
        RabbitEventNotificationPublisher publisher = new RabbitEventNotificationPublisher(template);
        ReflectionTestUtils.setField(publisher, "exchange", "parentconnect.topic");
        EventNotificationMessage message = EventNotificationMessage.of(EventNotificationType.EventCancelled,
                UUID.randomUUID(), "Atelier", UUID.randomUUID(), List.of(UUID.randomUUID()), LocalDateTime.now());

        publisher.publish(message);

        verify(template).convertAndSend("parentconnect.topic", "event.event.cancelled", message);
    }
}
