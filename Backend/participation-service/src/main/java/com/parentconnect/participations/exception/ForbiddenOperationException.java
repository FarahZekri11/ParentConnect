package com.parentconnect.participations.exception;

/** L'utilisateur est authentifié mais n'a pas le droit d'effectuer l'opération (HTTP 403). */
public class ForbiddenOperationException extends RuntimeException {
    public ForbiddenOperationException(String message) {
        super(message);
    }
}
