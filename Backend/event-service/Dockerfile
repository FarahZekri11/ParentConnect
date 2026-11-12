# syntax=docker/dockerfile:1
# =====================================================================
# event-service - image Docker multi-stage (parentconnect-event:1.0)
# Étape 1 : compilation Maven  |  Étape 2 : exécution sur un JRE léger
# Aucun secret n'est copié dans l'image : tout passe par les variables d'environnement.
# =====================================================================

# ---------- Étape 1 : build ----------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace

# Téléchargement des dépendances dans une couche séparée (cache Docker tant que pom.xml ne change pas)
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q package -DskipTests \
    && cp target/event-service.jar /workspace/app.jar

# ---------- Étape 2 : runtime ----------
FROM eclipse-temurin:17-jre-alpine
LABEL org.opencontainers.image.title="parentconnect-event" \
      org.opencontainers.image.version="1.0" \
      org.opencontainers.image.description="ParentConnect event-service"

RUN apk add --no-cache tzdata \
    && addgroup -S parentconnect && adduser -S parentconnect -G parentconnect
WORKDIR /app
COPY --from=build --chown=parentconnect:parentconnect /workspace/app.jar /app/app.jar

USER parentconnect
ENV TZ=Europe/Paris \
    LANG=C.UTF-8 \
    # Port interne standardisé ParentConnect (modifiable avec PORT ou APP_PORT)
    PORT=8080 \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8 -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8"
EXPOSE 8080

# Santé publique : GET /api/health (200 si le service et sa base sont opérationnels)
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD wget -qO- "http://localhost:${PORT:-8080}/api/health" | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
