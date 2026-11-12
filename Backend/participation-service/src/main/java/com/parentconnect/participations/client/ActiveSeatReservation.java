package com.parentconnect.participations.client;

import java.time.LocalDateTime;
import java.util.UUID;

public record ActiveSeatReservation(
        UUID id,
        UUID eventId,
        UUID userId,
        UUID operationId,
        LocalDateTime updatedAt
) {
}
