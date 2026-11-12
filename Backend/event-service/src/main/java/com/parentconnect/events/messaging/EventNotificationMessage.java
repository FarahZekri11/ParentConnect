package com.parentconnect.events.messaging;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Message de notification (contrat d'échange avec Messaging Service).
 *
 * @param messageId        identifiant unique du message (déduplication côté consommateur)
 * @param type             type de notification
 * @param eventId          identifiant de l'événement concerné
 * @param eventTitle       titre de l'événement au moment de la notification
 * @param actorUserId      utilisateur à l'origine de l'action
 * @param recipientUserIds utilisateurs à notifier (participants ayant une place active)
 * @param occurredAt       date de l'action
 */
public record EventNotificationMessage(
        UUID messageId,
        EventNotificationType type,
        UUID eventId,
        String eventTitle,
        UUID actorUserId,
        List<UUID> recipientUserIds,
        LocalDateTime occurredAt
) {

    public static EventNotificationMessage of(EventNotificationType type, UUID eventId, String eventTitle,
                                              UUID actorUserId, List<UUID> recipients, LocalDateTime occurredAt) {
        return new EventNotificationMessage(UUID.randomUUID(), type, eventId, eventTitle, actorUserId,
                List.copyOf(recipients), occurredAt);
    }
}
