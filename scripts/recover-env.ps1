# =====================================================================
# ParentConnect — reconstruction du .env et de keys/ à partir des conteneurs existants
# (cas d'un .env supprimé alors que la pile a déjà été démarrée : les bases et Keycloak gardent
#  les anciens mots de passe et l'ancienne clé, un nouveau "setup" ne fonctionnerait plus).
#
# Usage (depuis la racine du projet, Docker Desktop démarré) :
#   powershell -ExecutionPolicy Bypass -File .\scripts\recover-env.ps1
# Puis : .\scripts\setup.ps1  (ajoute les variables manquantes)  et  docker compose up -d --build
# Ne supprime rien et ne modifie aucun conteneur : lecture seule (docker inspect).
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (Test-Path '.env') {
    Write-Host "[recover] Un fichier .env existe déjà : rien à faire (le renommer d'abord pour le reconstruire)." -ForegroundColor Yellow
    exit 0
}

function Get-ContainerEnv([string]$Container) {
    $json = docker inspect --format '{{json .Config.Env}}' $Container 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $json) { return @{} }
    $result = @{}
    foreach ($entry in ($json | ConvertFrom-Json)) {
        $i = $entry.IndexOf('=')
        if ($i -gt 0) { $result[$entry.Substring(0, $i)] = $entry.Substring($i + 1) }
    }
    return $result
}

# Variable du .env  <-  (conteneur, variable dans le conteneur)
$sources = [ordered]@{
    'KEYCLOAK_ADMIN'             = @('parentconnect_keycloak', 'KEYCLOAK_ADMIN')
    'KEYCLOAK_ADMIN_PASSWORD'    = @('parentconnect_keycloak', 'KEYCLOAK_ADMIN_PASSWORD')
    'KC_DEMO_PASSWORD'           = @('parentconnect_keycloak', 'KC_DEMO_PASSWORD')
    'KC_REALM_PRIVATE_KEY'       = @('parentconnect_keycloak', 'KC_REALM_PRIVATE_KEY')
    'KEYCLOAK_REALM_PUBLIC_KEY'  = @('event-service', 'KEYCLOAK_REALM_PUBLIC_KEY')
    'RABBITMQ_USER'              = @('parentconnect_rabbitmq', 'RABBITMQ_DEFAULT_USER')
    'RABBITMQ_PASSWORD'          = @('parentconnect_rabbitmq', 'RABBITMQ_DEFAULT_PASS')
    'EVENTS_INTERNAL_API_KEY'    = @('event-service', 'INTERNAL_API_KEY')
    'MESSAGING_INTERNAL_API_KEY' = @('messaging-service', 'INTERNAL_API_KEY')
    'GEO_INTERNAL_API_KEY'       = @('parentconnect_geo_service', 'INTERNAL_API_KEY')
    'GEO_BLUR_SALT'              = @('parentconnect_geo_service', 'BLUR_SALT')
    'COMMUNITY_JWT_SECRET'       = @('parentconnect-post-service', 'JWT_SECRET')
    'POST_APP_KEY'               = @('parentconnect-post-service', 'APP_KEY')
    'COMMENT_APP_KEY'            = @('parentconnect-comment-service', 'APP_KEY')
    'CATEGORY_APP_KEY'           = @('parentconnect-category-service', 'APP_KEY')
    'REPORT_APP_KEY'             = @('parentconnect-report-service', 'APP_KEY')
    'MARKETPLACE_JWT_SECRET'     = @('parentconnect_marketplace_service', 'JWT_SECRET')
    'EVENT_DB_PASSWORD'          = @('parentconnect_event_db', 'POSTGRES_PASSWORD')
    'PARTICIPATION_DB_PASSWORD'  = @('parentconnect_participation_db', 'POSTGRES_PASSWORD')
    'POST_DB_PASSWORD'           = @('parentconnect_post_db', 'POSTGRES_PASSWORD')
    'COMMENT_DB_PASSWORD'        = @('parentconnect_comment_db', 'POSTGRES_PASSWORD')
    'CATEGORY_DB_PASSWORD'       = @('parentconnect_category_db', 'POSTGRES_PASSWORD')
    'REPORT_DB_PASSWORD'         = @('parentconnect_report_db', 'POSTGRES_PASSWORD')
    'BABYSITTING_DB_PASSWORD'    = @('parentconnect_babysitting_db', 'POSTGRES_PASSWORD')
}

$cache = @{}
$recovered = @{}
foreach ($name in $sources.Keys) {
    $container = $sources[$name][0]; $var = $sources[$name][1]
    if (-not $cache.ContainsKey($container)) { $cache[$container] = Get-ContainerEnv $container }
    $value = $cache[$container][$var]
    if ($value) { $recovered[$name] = $value }
}

# Indispensables : sans eux, les bases ou Keycloak refuseraient les connexions
$required = 'KC_REALM_PRIVATE_KEY', 'KEYCLOAK_REALM_PUBLIC_KEY', 'RABBITMQ_PASSWORD', 'EVENT_DB_PASSWORD'
$missingRequired = $required | Where-Object { -not $recovered.ContainsKey($_) }
if ($missingRequired) {
    Write-Host "[recover] Impossible de retrouver : $($missingRequired -join ', ')." -ForegroundColor Red
    Write-Host "[recover] Les conteneurs ParentConnect existent-ils encore ? (docker ps -a)" -ForegroundColor Red
    exit 1
}

# .env = .env.example avec les valeurs retrouvées ; les variables introuvables restent absentes
# (scripts/setup les ajoutera ensuite avec des secrets générés)
$lines = New-Object System.Collections.Generic.List[string]
foreach ($line in Get-Content '.env.example') {
    if ($line -match '^([A-Z0-9_]+)=') {
        $key = $Matches[1]
        if ($recovered.ContainsKey($key)) { $lines.Add("$key=$($recovered[$key])"); continue }
        if ($sources.Contains($key)) { continue }
    }
    $lines.Add($line)
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $root '.env'), ($lines -join "`r`n") + "`r`n", $utf8)

# keys/realm-public.pem (service Messaging) à partir de la clé publique du realm
$b64 = $recovered['KEYCLOAK_REALM_PUBLIC_KEY']
$pem = "-----BEGIN PUBLIC KEY-----`n" + (($b64 -split '(.{64})' | Where-Object { $_ }) -join "`n") + "`n-----END PUBLIC KEY-----`n"
New-Item -ItemType Directory -Force -Path (Join-Path $root 'keys') | Out-Null
[IO.File]::WriteAllText((Join-Path $root 'keys/realm-public.pem'), $pem, $utf8)

Write-Host "[recover] .env reconstruit ($($recovered.Count) valeurs retrouvées dans les conteneurs)." -ForegroundColor Green
Write-Host "[recover] keys/realm-public.pem reconstruit." -ForegroundColor Green
Write-Host "[recover] Ensuite : .\scripts\setup.ps1 (complète les variables manquantes), puis docker compose up -d --build"
