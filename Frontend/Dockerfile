# ==========================================
# Étape 1 : Build de l'application React avec Node
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copie des manifestes de dépendances
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

# Installation des dépendances
RUN npm install

# Copie du code source complet
COPY . .

# Argument pour injecter l'URL du Gateway au moment du build
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Compilation de l'application statique
RUN npm run build

# ==========================================
# Étape 2 : Image d'exécution minimale Nginx
# ==========================================
FROM nginx:1.27-alpine

# Copie de la configuration Nginx optimisée SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copie des fichiers compilés depuis l'étape builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Port d'écoute standard
EXPOSE 80

# Healthcheck conteneur
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
