package com.parentconnect.events.entity;

public enum SeatReservationStatus {
    /** La place est occupée par l'utilisateur. */
    ACTIVE,
    /** La place a été libérée (désinscription, compensation ou réconciliation). */
    RELEASED
}
