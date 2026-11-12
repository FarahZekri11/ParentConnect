package com.parentconnect.events.controller;

import com.parentconnect.events.exception.InvalidRequestException;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Set;

/**
 * Restreint les champs de tri autorisés afin d'éviter les erreurs SQL et l'exposition du modèle interne.
 */
final class PageableValidator {

    static final Set<String> EVENT_SORT_FIELDS =
            Set.of("startDateTime", "endDateTime", "createdAt", "title", "city", "capacity", "category");

    private PageableValidator() {
    }

    static Pageable validate(Pageable pageable, Set<String> allowed) {
        for (Sort.Order order : pageable.getSort()) {
            if (!allowed.contains(order.getProperty())) {
                throw new InvalidRequestException("Tri non autorisé sur '" + order.getProperty()
                        + "'. Valeurs possibles : " + allowed);
            }
        }
        return pageable;
    }
}
