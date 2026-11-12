# local-dev — outils de développement local

Ce dossier contient de l'**infrastructure utilisée uniquement pour tester en local** les deux microservices.
Il **ne fait pas partie du livrable** : en intégration, l'API Gateway, Keycloak, Eureka et RabbitMQ
sont des serveurs partagés fournis par l'intégrateur.

| Dossier | Rôle |
|---|---|
| `eureka-server/` | Serveur Eureka local (port 8761), lancé par le `docker-compose.yml` de la racine ou depuis IntelliJ |

RabbitMQ local : service `rabbitmq` du `docker-compose.yml` racine (`--profile rabbitmq`).
