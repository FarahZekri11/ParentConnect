package com.parentconnect.participations.exception;

/** Violation d'une règle métier (HTTP 409). */
public class BusinessConflictException extends RuntimeException {
    public BusinessConflictException(String message) {
        super(message);
    }
}
