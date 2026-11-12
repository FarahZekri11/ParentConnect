-- Données de démonstration : chargées UNIQUEMENT avec le profil Spring "dev".
-- Organisateur de démo : 11111111-1111-1111-1111-111111111111 (voir README / endpoint /dev/tokens)
INSERT INTO events (id, title, description, category, start_date_time, end_date_time, location_name, address, city,
                    latitude, longitude, capacity, min_child_age, max_child_age, organizer_id, status, reserved_places,
                    created_at, updated_at, version)
VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Pique-nique au parc de la Tête d''Or',
     'Pique-nique convivial entre parents, chacun apporte un plat à partager.', 'SORTIE',
     date_trunc('hour', now()) + INTERVAL '7 days', date_trunc('hour', now()) + INTERVAL '7 days 3 hours',
     'Parc de la Tête d''Or', 'Place du Général Leclerc', 'Lyon', 45.7772, 4.8550, 20, 0, 10,
     '11111111-1111-1111-1111-111111111111', 'PUBLISHED', 0, now(), now(), 0),

    ('aaaaaaaa-0000-0000-0000-000000000002', 'Atelier peinture parents-enfants',
     'Initiation à la peinture pour les 4-8 ans accompagnés d''un parent.', 'ATELIER',
     date_trunc('hour', now()) + INTERVAL '10 days', date_trunc('hour', now()) + INTERVAL '10 days 2 hours',
     'Maison des associations', '12 rue Garibaldi', 'Lyon', 45.7600, 4.8520, 8, 4, 8,
     '11111111-1111-1111-1111-111111111111', 'PUBLISHED', 0, now(), now(), 0),

    ('aaaaaaaa-0000-0000-0000-000000000003', 'Baby-gym du samedi',
     'Séance de motricité pour les tout-petits.', 'SPORT',
     date_trunc('hour', now()) + INTERVAL '5 days', date_trunc('hour', now()) + INTERVAL '5 days 1 hour',
     'Gymnase Jean Jaurès', '5 avenue Jean Jaurès', 'Villeurbanne', 45.7670, 4.8800, 2, 1, 3,
     '11111111-1111-1111-1111-111111111111', 'PUBLISHED', 0, now(), now(), 0),

    ('aaaaaaaa-0000-0000-0000-000000000004', 'Café des jeunes parents',
     'Rencontre et échanges autour de la parentalité.', 'RENCONTRE_PARENTS',
     date_trunc('hour', now()) + INTERVAL '3 days', date_trunc('hour', now()) + INTERVAL '3 days 2 hours',
     'Café Le Petit Monde', '3 rue de la République', 'Paris', 48.8566, 2.3522, 15, NULL, NULL,
     '11111111-1111-1111-1111-111111111111', 'PUBLISHED', 0, now(), now(), 0),

    ('aaaaaaaa-0000-0000-0000-000000000005', 'Après-midi jeux de société',
     'Jeux de société pour toute la famille.', 'JEUX',
     date_trunc('hour', now()) + INTERVAL '14 days', date_trunc('hour', now()) + INTERVAL '14 days 4 hours',
     'Ludothèque municipale', '20 rue Nationale', 'Lille', 50.6365, 3.0635, 25, 5, 12,
     '11111111-1111-1111-1111-111111111111', 'PUBLISHED', 0, now(), now(), 0)
ON CONFLICT (id) DO NOTHING;
