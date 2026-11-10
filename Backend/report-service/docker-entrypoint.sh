#!/bin/sh
set -e

echo "===> [ParentConnect Community Service] Initializing container..."

# 1. Wait for Database to become ready
if [ "$DB_CONNECTION" = "pgsql" ] && [ -n "$DB_HOST" ]; then
    DB_PORT_FINAL="${DB_PORT:-5432}"
    echo "===> Checking PostgreSQL connectivity at ${DB_HOST}:${DB_PORT_FINAL}..."
    RETRIES=30
    until pg_isready -h "$DB_HOST" -p "$DB_PORT_FINAL" -U "${DB_USERNAME:-postgres}" > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
        echo "===> Waiting for PostgreSQL (${DB_HOST}:${DB_PORT_FINAL}) to accept connections... ($RETRIES attempts left)"
        RETRIES=$((RETRIES - 1))
        sleep 2
    done

    if [ $RETRIES -eq 0 ]; then
        echo "===> [ERROR] Could not connect to PostgreSQL within the timeout period."
        echo "===> Please verify database container health and credentials."
        exit 1
    fi
    echo "===> PostgreSQL is ready and reachable!"
elif [ "$DB_CONNECTION" = "mysql" ] && [ -n "$DB_HOST" ]; then
    DB_PORT_FINAL="${DB_PORT:-3306}"
    echo "===> Checking MySQL connectivity at ${DB_HOST}:${DB_PORT_FINAL}..."
    RETRIES=30
    until nc -z "$DB_HOST" "$DB_PORT_FINAL" > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
        echo "===> Waiting for MySQL (${DB_HOST}:${DB_PORT_FINAL})... ($RETRIES attempts left)"
        RETRIES=$((RETRIES - 1))
        sleep 2
    done
    echo "===> MySQL is reachable!"
fi

# 2. Ensure storage and cache directory permissions
echo "===> Verifying storage and cache permissions..."
mkdir -p storage/framework/cache/data \
         storage/framework/sessions \
         storage/framework/views \
         storage/logs \
         storage/api-docs \
         bootstrap/cache

chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# 3. Check for application encryption key
if [ -z "$APP_KEY" ]; then
    echo "===> [WARNING] APP_KEY is not set. Generating a new key..."
    php artisan key:generate --force --no-interaction
fi

# 4. Optional Automatic Migrations
if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
    echo "===> Running database migrations..."
    php artisan migrate --force --no-interaction
fi

# 5. Optional Automatic Database Seeding
if [ "${AUTO_SEED:-false}" = "true" ]; then
    echo "===> Seeding database..."
    php artisan db:seed --force --no-interaction
fi

# 6. Generate Swagger / OpenAPI documentation if requested
if [ "${L5_SWAGGER_GENERATE_ALWAYS:-false}" = "true" ]; then
    echo "===> Generating OpenAPI / Swagger documentation..."
    php artisan l5-swagger:generate --no-interaction || echo "===> [WARN] Swagger generation completed with notice."
fi

# 7. Environment-specific optimizations
if [ "$APP_ENV" = "production" ]; then
    echo "===> Production environment detected: caching configuration and routes..."
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
else
    echo "===> Development environment detected: clearing cached configuration..."
    php artisan config:clear
    php artisan route:clear
fi

# 8. Eureka Service Discovery Integration
if [ -n "$EUREKA_SERVER_URL" ]; then
    echo "===> Connecting to Eureka Server at ${EUREKA_SERVER_URL}..."
    RETRIES=20
    until curl -s -f -m 3 "${EUREKA_SERVER_URL}" > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
        echo "===> Waiting for Eureka Server to accept HTTP connections... ($RETRIES attempts left)"
        RETRIES=$((RETRIES - 1))
        sleep 2
    done

    if [ $RETRIES -gt 0 ]; then
        echo "===> Eureka Server is reachable! Registering service..."
        php artisan eureka:register || echo "===> [WARN] Initial Eureka registration completed with notice."
        
        echo "===> Spawning Eureka heartbeat daemon in background..."
        php artisan eureka:heartbeat --loop > /dev/null 2>&1 &
        HEARTBEAT_PID=$!
    else
        echo "===> [WARN] Eureka Server was not reachable during startup. Will continue; background registration will retry."
    fi
fi

# Graceful termination handler (Deregister on container stop)
cleanup() {
    echo "===> [ParentConnect Community Service] Shutting down container..."
    if [ -n "$EUREKA_SERVER_URL" ]; then
        echo "===> Deregistering service from Eureka..."
        php artisan eureka:deregister || true
    fi
    if [ -n "$HEARTBEAT_PID" ]; then
        kill -TERM "$HEARTBEAT_PID" 2>/dev/null || true
    fi
    if [ -n "$APP_PID" ]; then
        kill -TERM "$APP_PID" 2>/dev/null || true
        wait "$APP_PID"
    fi
    exit 0
}

trap cleanup SIGTERM SIGINT

echo "===> [ParentConnect Community Service] Ready! Starting application process..."
"$@" &
APP_PID=$!
wait "$APP_PID"

