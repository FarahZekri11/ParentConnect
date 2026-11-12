/**
 * Clients sortants d'Event Service.
 * <p>
 * Event Service n'appelle aucun autre microservice de manière synchrone : il est appelé par
 * Participation Service (voir {@code controller.InternalEventController}) et publie ses notifications
 * via {@code messaging.EventNotificationPublisher}. Ce package est volontairement vide.
 */
package com.parentconnect.events.client;
