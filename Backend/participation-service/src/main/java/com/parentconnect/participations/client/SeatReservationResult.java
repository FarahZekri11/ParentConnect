package com.parentconnect.participations.client;

import java.util.UUID;

/**
 * @param operationId opération qui détient réellement la place (peut différer de celle demandée si la place
 *                    était déjà détenue : dans ce cas alreadyHeld = true et aucune place n'a été consommée)
 */
public record SeatReservationResult(
        UUID eventId,
        UUID userId,
        UUID operationId,
        String status,
        boolean alreadyHeld,
        int reservedPlaces,
        int availablePlaces
) {
}
