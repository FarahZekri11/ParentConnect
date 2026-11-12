# syntax=docker/dockerfile:1.4
# ==============================================================================
# ParentConnect - Community Microservice Dockerfile
# Optimized for Laravel 12 + PHP 8.2 + PostgreSQL
# ==============================================================================

FROM php:8.2-cli-alpine AS base

# Install system dependencies & PostgreSQL client utilities (pg_isready)
RUN apk add --no-cache \
    curl \
    git \
    unzip \
    libzip-dev \
    libpq-dev \
    sqlite-dev \
    postgresql-client \
    linux-headers \
    ca-certificates

# Install required PHP extensions
# (pdo_pgsql, pgsql for PostgreSQL; pdo_sqlite for PHPUnit in-memory tests;
#  bcmath, zip, pcntl, opcache for Laravel core performance)
RUN docker-php-ext-install -j$(nproc) \
    bcmath \
    pdo_pgsql \
    pgsql \
    pdo_sqlite \
    zip \
    pcntl \
    opcache

# Recommended PHP production settings
RUN { \
        echo 'opcache.enable=1'; \
        echo 'opcache.enable_cli=1'; \
        echo 'opcache.memory_consumption=128'; \
        echo 'opcache.interned_strings_buffer=8'; \
        echo 'opcache.max_accelerated_files=10000'; \
        echo 'opcache.validate_timestamps=1'; \
        echo 'opcache.revalidate_freq=2'; \
        echo 'opcache.fast_shutdown=1'; \
    } > /usr/local/etc/php/conf.d/opcache-recommended.ini \
 && { \
        echo 'memory_limit=256M'; \
        echo 'upload_max_filesize=20M'; \
        echo 'post_max_size=25M'; \
        echo 'max_execution_time=60'; \
    } > /usr/local/etc/php/conf.d/custom-laravel.ini

# Install official Composer 2 binary from Docker Hub
COPY --from=composer:2.8 /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/html

# Layer caching: Copy composer dependency definitions first
COPY composer.json composer.lock ./

# Install application dependencies without running scripts/autoloader yet
# (Dependencies layer will be cached unless composer.json or composer.lock change)
RUN composer install --no-dev --no-interaction --no-plugins --no-scripts --prefer-dist

# Copy the rest of the application codebase
COPY . .

# Finalize composer autoloader with optimizations
RUN composer dump-autoload --optimize --no-dev

# Prepare storage & cache directories with appropriate ownership and permissions
RUN mkdir -p \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        storage/api-docs \
        bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# Copy entrypoint script, strip Windows CRLF line endings, and ensure executable rights
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose HTTP application port
EXPOSE 8080

# Container healthcheck querying the dedicated microservice endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://127.0.0.1:8080/api/health || exit 1

# Configure container entrypoint and default execution command
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8080"]
