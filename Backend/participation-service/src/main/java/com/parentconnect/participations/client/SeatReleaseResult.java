package com.parentconnect.participations.client;

import java.util.UUID;

public record SeatReleaseResult(
        UUID eventId,
        UUID userId,
        boolean released,
        String outcome,
        int reservedPlaces,
        int availablePlaces
) {
}
