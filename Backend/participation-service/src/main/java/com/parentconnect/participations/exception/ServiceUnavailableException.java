package com.parentconnect.participations.exception;

/** Une dépendance interservices (Event Service) est indisponible ou ne répond pas à temps (HTTP 503). */
public class ServiceUnavailableException extends RuntimeException {
    public ServiceUnavailableException(String message) {
        super(message);
    }

    public ServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
