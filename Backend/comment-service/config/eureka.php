<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Eureka Server URL
    |--------------------------------------------------------------------------
    | The base URL where Spring Cloud Netflix Eureka Server is reachable.
    | In Docker Compose, the service name is 'eureka-server' on port 8761.
    */
    'server_url' => env('EUREKA_SERVER_URL', 'http://eureka-server:8761/eureka/'),

    /*
    |--------------------------------------------------------------------------
    | Eureka Application Name
    |--------------------------------------------------------------------------
    | Service identifier registered in Eureka (Spring Cloud Eureka displays
    | this in uppercase). Must match the service name used by API Gateway.
    */
    'app_name' => env('EUREKA_APP_NAME', 'parentconnect-laravel'),

    /*
    |--------------------------------------------------------------------------
    | Instance Networking
    |--------------------------------------------------------------------------
    | Hostname/IP address and port reachable by other containers (Gateway).
    */
    'instance_host' => env('EUREKA_INSTANCE_HOST', 'parentconnect-community-api'),
    'port' => (int) env('EUREKA_PORT', env('APP_PORT', 8000)),

    /*
    |--------------------------------------------------------------------------
    | Heartbeat and Lease Configuration
    |--------------------------------------------------------------------------
    | Netflix Eureka default renewal interval is 30s with a 90s lease duration.
    */
    'heartbeat_interval' => (int) env('EUREKA_HEARTBEAT_INTERVAL', 30),
    'lease_duration' => (int) env('EUREKA_LEASE_DURATION', 90),

    /*
    |--------------------------------------------------------------------------
    | Endpoints
    |--------------------------------------------------------------------------
    | Healthcheck and homepage paths exposed by the Laravel microservice.
    */
    'health_path' => env('EUREKA_HEALTH_PATH', '/api/health'),
    'home_path' => env('EUREKA_HOME_PATH', '/'),
];
