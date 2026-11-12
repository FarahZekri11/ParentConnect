package com.parentconnect.events.dto.internal;

import java.time.LocalDateTime;
import java.util.UUID;

public record ActiveSeatReservationResponse(
        UUID id,
        UUID eventId,
        UUID userId,
        UUID operationId,
        LocalDateTime updatedAt
) {
}
