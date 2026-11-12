# syntax=docker/dockerfile:1
# =====================================================================
# eureka-server - image Docker multi-stage (parentconnect-eureka:1.0)
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
    && cp target/eureka-server.jar /workspace/app.jar

# ---------- Étape 2 : runtime ----------
FROM eclipse-temurin:17-jre-alpine
LABEL org.opencontainers.image.title="parentconnect-eureka" \
      org.opencontainers.image.version="1.0" \
      org.opencontainers.image.description="ParentConnect eureka-server"

RUN apk add --no-cache tzdata \
    && addgroup -S parentconnect && adduser -S parentconnect -G parentconnect
WORKDIR /app
COPY --from=build --chown=parentconnect:parentconnect /workspace/app.jar /app/app.jar

USER parentconnect
ENV TZ=Europe/Paris \
    LANG=C.UTF-8 \
    SERVER_PORT=8761 \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8 -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8"
EXPOSE 8761

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD wget -qO- http://localhost:8761/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
