package com.parentconnect.gateway.registration;

import com.parentconnect.gateway.registration.RegistrationController.RegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;

class RegistrationControllerTest {

    private static RegisterRequest req(String first, String last, String email, String password) {
        return new RegisterRequest(first, last, email, password);
    }

    private static KeycloakAdminClient client(String secret) {
        return new KeycloakAdminClient("http://localhost:1", "parentconnect", "parentconnect-registration", secret,
                "frontend-parentconnect");
    }

    @Test
    void validRequest_isAccepted_forParentAndBabysitter() {
        assertThat(RegistrationController.validate(req("Léa", "Martin", "lea.martin@email.com", "MotDePasse2026"))).isNull();
        assertThat(RegistrationController.validate(
                new RegisterRequest("Léa", "Martin", "lea@email.com", "MotDePasse2026", "babysitter"))).isNull();
    }

    @Test
    void adminRole_cannotBeChosenAtRegistration() {
        assertThat(RegistrationController.validate(
                new RegisterRequest("Léa", "Martin", "lea@email.com", "MotDePasse2026", "ADMIN"))).contains("Rôle invalide");
        assertThat(RegistrationController.validate(
                new RegisterRequest("Léa", "Martin", "lea@email.com", "MotDePasse2026", "PROFESSIONAL"))).contains("Rôle invalide");
    }

    @Test
    void invalidRequests_areRejectedWithMessage() {
        assertThat(RegistrationController.validate(null)).isNotNull();
        assertThat(RegistrationController.validate(req(" ", "Martin", "lea@email.com", "MotDePasse2026"))).contains("prénom");
        assertThat(RegistrationController.validate(req("Léa", "", "lea@email.com", "MotDePasse2026"))).contains("nom");
        assertThat(RegistrationController.validate(req("Léa", "Martin", "pas-un-email", "MotDePasse2026"))).contains("e-mail");
        assertThat(RegistrationController.validate(req("Léa", "Martin", "lea@email.com", "court"))).contains("8");
    }

    @Test
    void withoutClientSecret_registrationIsUnavailable() {
        var response = new RegistrationController(client("")).register(req("Léa", "Martin", "lea@email.com", "MotDePasse2026")).block();
        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void invalidRequest_returns400_withoutCallingKeycloak() {
        var response = new RegistrationController(client("secret")).register(req("Léa", "Martin", "lea@email.com", "court")).block();
        assertThat(response).isNotNull();
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
