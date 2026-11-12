package com.parentconnect.events.security;

public final class Roles {
    public static final String PARENT = "PARENT";
    public static final String PROFESSIONNEL = "PROFESSIONNEL";
    /** Babysitter (inscription « Babysitter ») : consulte les événements, ne s'y inscrit pas. */
    public static final String BABYSITTER = "BABYSITTER";
    public static final String ADMIN = "ADMIN";
    /** Rôle technique attribué aux appels interservices authentifiés par clé. */
    public static final String INTERNAL_SERVICE = "INTERNAL_SERVICE";

    private Roles() {
    }
}
