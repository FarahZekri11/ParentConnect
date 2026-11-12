-- Détails d'une inscription, saisis par le parent et affichés à l'organisateur :
--   participant_name : nom affiché (issu du token Keycloak, jamais saisi par le client)
--   children_count   : nombre d'enfants qui viennent (information pour l'organisateur ; une inscription = une place)
--   note             : message facultatif à l'organisateur (allergies, poussette...)
ALTER TABLE participations ADD COLUMN participant_name VARCHAR(120);
ALTER TABLE participations ADD COLUMN children_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE participations ADD COLUMN note VARCHAR(500);
ALTER TABLE participations ADD CONSTRAINT ck_participations_children_count CHECK (children_count BETWEEN 1 AND 10);
