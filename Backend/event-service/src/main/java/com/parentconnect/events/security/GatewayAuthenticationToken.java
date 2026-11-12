package com.parentconnect.events.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

import java.util.Collection;

/**
 * Identité propagée par l'API Gateway (en-têtes X-User-Id / X-User-Role), le JWT ayant déjà été vérifié par celle-ci.
 */
public class GatewayAuthenticationToken extends AbstractAuthenticationToken {

    private final String userId;

    public GatewayAuthenticationToken(String userId, Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.userId = userId;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return "";
    }

    @Override
    public Object getPrincipal() {
        return userId;
    }

    @Override
    public String getName() {
        return userId;
    }
}
