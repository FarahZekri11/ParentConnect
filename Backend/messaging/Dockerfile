# ==========================================
# Étape 1 : Build de l'exécutable Go
# ==========================================
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Installation des dépendances système nécessaires au build
RUN apk add --no-cache git ca-certificates tzdata

# Cache des dépendances Go
COPY go.mod go.sum* ./
RUN go mod download || true

# Copie du code source complet
COPY . .

# Compilation binaire statique sans CGO, optimisée pour conteneur léger
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /app/bin/messaging-service \
    ./cmd/server/main.go

# ==========================================
# Étape 2 : Image d'exécution minimale et sécurisée
# ==========================================
FROM alpine:3.20

# Création d'un utilisateur applicatif non-privilégié (sécurité renforcée)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copie des certificats SSL et fuseaux horaires
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copie du binaire compilé
COPY --from=builder /app/bin/messaging-service /app/messaging-service

# Attribution des droits à l'utilisateur non-root
RUN chown -R appuser:appgroup /app

USER appuser

# Exposition du port du service
EXPOSE 8085

# Sonde de vie au niveau conteneur Docker
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8085/health || exit 1

ENTRYPOINT ["/app/messaging-service"]
