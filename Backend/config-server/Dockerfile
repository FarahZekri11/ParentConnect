# syntax=docker/dockerfile:1
# =====================================================================
# config-server - Spring Cloud Config Server (parentconnect/config-server:1.0)
# La configuration est lue dans /config-repo (dossier Backend/config-repo monté en lecture seule).
# =====================================================================

# ---------- Étape 1 : build ----------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q package -DskipTests \
    && cp target/config-server.jar /workspace/app.jar

# ---------- Étape 2 : runtime ----------
FROM eclipse-temurin:17-jre-alpine
LABEL org.opencontainers.image.title="parentconnect-config-server" \
      org.opencontainers.image.version="1.0"
RUN addgroup -S parentconnect && adduser -S parentconnect -G parentconnect
WORKDIR /app
COPY --from=build --chown=parentconnect:parentconnect /workspace/app.jar /app/app.jar
USER parentconnect
ENV PORT=8888 \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8"
EXPOSE 8888
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD wget -qO- "http://localhost:${PORT:-8888}/actuator/health" | grep -q '"status":"UP"' || exit 1
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
