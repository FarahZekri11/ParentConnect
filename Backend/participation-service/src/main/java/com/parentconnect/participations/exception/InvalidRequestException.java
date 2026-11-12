package com.parentconnect.participations.exception;

/** Données invalides détectées par une règle transverse (HTTP 400). */
public class InvalidRequestException extends RuntimeException {
    public InvalidRequestException(String message) {
        super(message);
    }
}
