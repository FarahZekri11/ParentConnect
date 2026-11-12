package com.parentconnect.participations.messaging;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RabbitEventNotificationPublisherTest {

    @Test
    void publishesJsonMessageOnSharedTopicExchangeWithExplicitRoutingKey() {
        RabbitTemplate template = mock(RabbitTemplate.class);
        RabbitEventNotificationPublisher publisher = new RabbitEventNotificationPublisher(template);
        ReflectionTestUtils.setField(publisher, "exchange", "parentconnect.topic");
        EventNotificationMessage message = EventNotificationMessage.of(EventNotificationType.EventJoined,
                UUID.randomUUID(), "Atelier", UUID.randomUUID(), List.of(UUID.randomUUID()), LocalDateTime.now());

        publisher.publish(message);

        ArgumentCaptor<EventEnvelope> captor = ArgumentCaptor.forClass(EventEnvelope.class);
        verify(template).convertAndSend(eq("parentconnect.topic"), eq("participation.participation.joined"), captor.capture());
        EventEnvelope envelope = captor.getValue();
        assertThat(envelope.eventId()).isEqualTo(message.messageId().toString());
        assertThat(envelope.type()).isEqualTo(message.type().name());
        assertThat(envelope.version()).isEqualTo("1.0");
        assertThat(envelope.occurredAt()).matches(".*(Z|[+-]\\d{2}:\\d{2})$");
        assertThat(envelope.data())
                .containsEntry("event_id", message.eventId().toString())
                .containsEntry("event_title", message.eventTitle())
                .containsEntry("actor_user_id", message.actorUserId().toString())
                .containsEntry("recipient_user_ids",
                        message.recipientUserIds().stream().map(UUID::toString).toList());
    }
}
