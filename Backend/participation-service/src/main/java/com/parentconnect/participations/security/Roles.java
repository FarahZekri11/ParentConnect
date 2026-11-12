package com.parentconnect.participations.security;

public final class Roles {
    public static final String PARENT = "PARENT";
    public static final String PROFESSIONNEL = "PROFESSIONNEL";
    /** Babysitter (inscription « Babysitter ») : consulte les événements, ne s'y inscrit pas. */
    public static final String BABYSITTER = "BABYSITTER";
    public static final String ADMIN = "ADMIN";

    private Roles() {
    }
}
