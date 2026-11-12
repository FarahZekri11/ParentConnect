# =====================================================================
# ParentConnect — tests d'intégration par étapes (Windows PowerShell 5.1 ou PowerShell 7)
# Après "docker compose up -d --build", depuis la racine du projet :  .\scripts\smoke-test.ps1
# Lit KC_DEMO_PASSWORD, KC_APP_ADMIN_PASSWORD, RABBITMQ_USER, RABBITMQ_PASSWORD dans .env
# =====================================================================
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Get-EnvValue([string]$Name) {
    $line = Get-Content .env | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
    return ($line -replace "^$Name=", '')
}

$GW = 'http://localhost:8080'; $KC = 'http://localhost:8180'; $EUREKA = 'http://localhost:8761'; $RMQ = 'http://localhost:15672/api'
$DemoPassword = Get-EnvValue 'KC_DEMO_PASSWORD'
# Le compte administrateur a son propre mot de passe (généré par scripts/setup), distinct des comptes de démo
$AdminPassword = Get-EnvValue 'KC_APP_ADMIN_PASSWORD'; if (-not $AdminPassword) { $AdminPassword = $DemoPassword }
$RmqAuth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes((Get-EnvValue 'RABBITMQ_USER') + ':' + (Get-EnvValue 'RABBITMQ_PASSWORD')))

$script:Pass = 0; $script:Fail = 0; $script:Failed = @(); $script:LastBody = ''

function Invoke-Code([string]$Url, [string]$Method = 'GET', [hashtable]$Headers = @{}, [string]$Body = $null) {
    try {
        $params = @{ Uri = $Url; Method = $Method; Headers = $Headers; UseBasicParsing = $true; TimeoutSec = 30 }
        if ($Body) { $params.Body = [Text.Encoding]::UTF8.GetBytes($Body); $params.ContentType = 'application/json' }
        $r = Invoke-WebRequest @params
        # Certains types de contenu (ex. application/vnd.spring-boot.actuator.v3+json) sont renvoyés en octets
        $script:LastBody = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
        return [int]$r.StatusCode
    } catch {
        $script:LastBody = ''
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

# Envoi multipart (photos) compatible Windows PowerShell 5.1 et PowerShell 7
Add-Type -AssemblyName System.Net.Http
function Invoke-Upload([string]$Url, [hashtable]$Headers, [string]$Field, [string]$Path, [string]$ContentType, [hashtable]$Fields = @{}) {
    $client = New-Object System.Net.Http.HttpClient
    try {
        foreach ($k in $Headers.Keys) { [void]$client.DefaultRequestHeaders.TryAddWithoutValidation($k, $Headers[$k]) }
        [void]$client.DefaultRequestHeaders.TryAddWithoutValidation('Accept', 'application/json')
        $form = New-Object System.Net.Http.MultipartFormDataContent
        foreach ($k in $Fields.Keys) { $form.Add((New-Object System.Net.Http.StringContent($Fields[$k])), $k) }
        $file = New-Object System.Net.Http.ByteArrayContent(, [IO.File]::ReadAllBytes($Path))
        $file.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($ContentType)
        $form.Add($file, $Field, [IO.Path]::GetFileName($Path))
        $resp = $client.PostAsync($Url, $form).Result
        $script:LastBody = $resp.Content.ReadAsStringAsync().Result
        return [int]$resp.StatusCode
    } catch { $script:LastBody = ''; return 0 } finally { $client.Dispose() }
}

function Expect([string]$Description, [int]$Expected, [int]$Actual) {
    if ($Actual -eq $Expected) { Write-Host "  [OK]   $Description -> $Actual" -ForegroundColor Green; $script:Pass++ }
    else { Write-Host "  [FAIL] $Description : attendu $Expected, obtenu $Actual" -ForegroundColor Red; $script:Fail++; $script:Failed += $Description }
}

function Check([string]$Description, [bool]$Condition) {
    if ($Condition) { Write-Host "  [OK]   $Description" -ForegroundColor Green; $script:Pass++ }
    else { Write-Host "  [FAIL] $Description" -ForegroundColor Red; $script:Fail++; $script:Failed += $Description }
}

function Get-LastId {
    try {
        $json = $script:LastBody | ConvertFrom-Json
        if ($json.id) { return $json.id }          # Spring / NestJS : objet à la racine
        if ($json.data.id) { return $json.data.id } # Laravel : ressource enveloppée dans "data"
    } catch { }
    return $null
}

function Get-Token([string]$User, [string]$Password = $DemoPassword) {
    try {
        $r = Invoke-RestMethod -Method Post -Uri "$KC/realms/parentconnect/protocol/openid-connect/token" -Body @{
            grant_type = 'password'; client_id = 'frontend-parentconnect'; username = $User; password = $Password }
        return $r.access_token
    } catch { return $null }
}

Write-Host '== Étape 1 — Infrastructure' -ForegroundColor Cyan
Expect 'Eureka /actuator/health' 200 (Invoke-Code "$EUREKA/actuator/health")
Expect 'Keycloak realm parentconnect' 200 (Invoke-Code "$KC/realms/parentconnect")
Expect 'RabbitMQ API de management' 200 (Invoke-Code "$RMQ/overview" -Headers @{ Authorization = $RmqAuth })
Expect 'API Gateway /actuator/health' 200 (Invoke-Code "$GW/actuator/health")
Expect 'Frontend (nginx)' 200 (Invoke-Code 'http://localhost:4200/')

Write-Host '== Étape 2 — Microservices (santé directe) et bases de données' -ForegroundColor Cyan
Expect 'event-service /api/health' 200 (Invoke-Code 'http://localhost:8085/api/health')
Expect 'participation-service /api/health' 200 (Invoke-Code 'http://localhost:8086/api/health')
Expect 'post-service /api/health' 200 (Invoke-Code 'http://localhost:8001/api/health')
Expect 'comment-service /api/health' 200 (Invoke-Code 'http://localhost:8002/api/health')
Expect 'category-service /api/health' 200 (Invoke-Code 'http://localhost:8003/api/health')
Expect 'report-service /api/health' 200 (Invoke-Code 'http://localhost:8004/api/health')
Expect 'babysitting-service /health' 200 (Invoke-Code 'http://localhost:8005/health')
Expect 'marketplace-service /api/health' 200 (Invoke-Code 'http://localhost:3002/api/health')
Expect 'messaging-service /health' 200 (Invoke-Code 'http://localhost:8007/health')
Expect 'geo-service /health' 200 (Invoke-Code 'http://localhost:8008/health')

Write-Host '== Étape 3 — Enregistrement Eureka' -ForegroundColor Cyan
$apps = (Invoke-WebRequest -Uri "$EUREKA/eureka/apps" -Headers @{ Accept = 'application/json' } -UseBasicParsing).Content
foreach ($app in 'PARENTCONNECT-EVENT-SERVICE', 'PARENTCONNECT-PARTICIPATION-SERVICE', 'PARENTCONNECT-POST', 'PARENTCONNECT-COMMENT',
                 'PARENTCONNECT-CATEGORY', 'PARENTCONNECT-REPORT', 'PARENTCONNECT-BABYSITTING', 'MARKETPLACE-SERVICE', 'MESSAGING-SERVICE', 'PARENTCONNECT-GEO-SERVICE', 'PARENTCONNECT-CONFIG-SERVER', 'API-GATEWAY') {
    Check "Eureka : $app" ($apps -match "`"name`":`"$app`"")
}

Write-Host '== Étape 4 — Sécurité (Keycloak + Gateway)' -ForegroundColor Cyan
$admin = Get-Token 'admin' $AdminPassword; $parent = Get-Token 'parent_test'; $pro = Get-Token 'pro_test'; $sitter = Get-Token 'babysitter_test'
Check 'Tokens Keycloak (admin, parent_test, pro_test, babysitter_test)' ($admin -and $parent -and $pro -and $sitter)
if ($AdminPassword -ne $DemoPassword) { Check 'Admin : le mot de passe de démo est refusé' (-not (Get-Token 'admin' $DemoPassword)) }
$P = @{ Authorization = "Bearer $parent" }; $PRO = @{ Authorization = "Bearer $pro" }; $A = @{ Authorization = "Bearer $admin" }
$S = @{ Authorization = "Bearer $sitter" }
Expect 'Sans token -> /api/events' 401 (Invoke-Code "$GW/api/events")
# Inscription d'un nouveau parent : la Gateway crée le compte Keycloak avec le rôle PARENT
$regEmail = 'nouveau.parent.' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + '@test.local'; $regPwd = 'Inscription2026!'
$regBody = @{ firstName = 'Léa'; lastName = 'Testeur'; email = $regEmail; password = $regPwd } | ConvertTo-Json -Compress
Expect "Inscription d'un nouveau parent (Gateway -> Keycloak)" 201 (Invoke-Code "$GW/api/auth/register" 'POST' @{} $regBody)
$regUserId = Get-LastId
Expect 'Inscription : e-mail déjà utilisé' 409 (Invoke-Code "$GW/api/auth/register" 'POST' @{} $regBody)
Expect 'Inscription : mot de passe trop court' 400 (Invoke-Code "$GW/api/auth/register" 'POST' @{} '{"firstName":"A","lastName":"B","email":"court@test.local","password":"court"}')
$newToken = $null
try {
    $newToken = (Invoke-RestMethod -Method Post -Uri "$KC/realms/parentconnect/protocol/openid-connect/token" -Body @{
        grant_type = 'password'; client_id = 'frontend-parentconnect'; username = $regEmail; password = $regPwd }).access_token
} catch { }
Check 'Connexion du nouveau parent (Keycloak)' ([bool]$newToken)
Expect 'Nouveau parent : rôle PARENT (mes inscriptions)' 200 (Invoke-Code "$GW/api/events/me/joined" -Headers @{ Authorization = "Bearer $newToken" })
$N = @{ Authorization = "Bearer $newToken" }
Expect 'Profil du compte (GET /api/auth/me)' 200 (Invoke-Code "$GW/api/auth/me" -Headers $N)
Check 'Profil : rôle PARENT' ($script:LastBody -match '"PARENT"')
Expect 'Modification du profil (PUT /api/auth/me)' 200 (Invoke-Code "$GW/api/auth/me" 'PUT' $N '{"firstName":"Léa-Marie","lastName":"Testeur"}')
Expect 'Changement de mot de passe : ancien mot de passe faux' 400 (Invoke-Code "$GW/api/auth/me/password" 'PUT' $N '{"currentPassword":"Mauvais2026!","newPassword":"Nouveau2026!x"}')
Expect 'Changement de mot de passe' 200 (Invoke-Code "$GW/api/auth/me/password" 'PUT' $N (@{ currentPassword = $regPwd; newPassword = 'Nouveau2026!x' } | ConvertTo-Json -Compress))
Check 'Connexion avec le nouveau mot de passe' ([bool](Get-Token $regEmail 'Nouveau2026!x'))
# Inscription d'un babysitter ; le rôle ADMIN ne peut pas être choisi à l'inscription
$sitEmail = 'nouveau.babysitter.' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + '@test.local'
$sitBody = @{ firstName = 'Sam'; lastName = 'Garde'; email = $sitEmail; password = $regPwd; role = 'BABYSITTER' } | ConvertTo-Json -Compress
Expect "Inscription d'un babysitter" 201 (Invoke-Code "$GW/api/auth/register" 'POST' @{} $sitBody)
$sitUserId = Get-LastId
Check 'Inscription : rôle BABYSITTER attribué' ($script:LastBody -match '"role":"BABYSITTER"')
Expect 'Inscription avec le rôle ADMIN refusée' 400 (Invoke-Code "$GW/api/auth/register" 'POST' @{} '{"firstName":"Pirate","lastName":"Admin","email":"pirate.admin@test.local","password":"Inscription2026!","role":"ADMIN"}')
$sig = $parent.Split('.')[2]; $forged = ($parent.Substring(0, $parent.LastIndexOf('.') + 1)) + 'AAAAAAAAAA' + $sig.Substring(10)
Expect 'Token à signature falsifiée' 401 (Invoke-Code "$GW/api/events" -Headers @{ Authorization = "Bearer $forged" })
Expect "En-têtes d'identité usurpés sans token" 401 (Invoke-Code "$GW/api/events" -Headers @{ 'X-Gateway-Auth' = 'verified'; 'X-User-Id' = 'aaaaaaaa-0000-4000-8000-000000000001'; 'X-User-Role' = 'ADMIN' })
Expect 'Endpoint interne via la Gateway' 404 (Invoke-Code "$GW/internal/events/00000000-0000-0000-0000-000000000000")
Expect 'Endpoint interne Géolocalisation via la Gateway' 404 (Invoke-Code "$GW/internal/geo/distance?user_a=a&user_b=b")
Expect 'Accès direct à un service sans token' 401 (Invoke-Code 'http://localhost:8085/api/events')
Expect '/api/admin/** refusé à PARENT dès la Gateway' 403 (Invoke-Code "$GW/api/admin/reports" -Headers $P)

Write-Host '== Étape 5 — Routes Gateway et scénarios métier' -ForegroundColor Cyan
$start = (Get-Date).AddDays(5).ToString('yyyy-MM-dd') + 'T14:00:00'; $end = (Get-Date).AddDays(5).ToString('yyyy-MM-dd') + 'T16:00:00'
Expect 'PARENT liste les événements' 200 (Invoke-Code "$GW/api/events" -Headers $P)
$eventStamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$eventBody = "{`"title`":`"Atelier intégration $eventStamp`",`"category`":`"ATELIER`",`"startDateTime`":`"$start`",`"endDateTime`":`"$end`",`"city`":`"Lyon`",`"capacity`":5}"
Expect "PARENT ne crée pas d'événement (réservé à l'ADMIN)" 403 (Invoke-Code "$GW/api/events" 'POST' $P $eventBody)
Expect 'ADMIN crée un événement' 201 (Invoke-Code "$GW/api/events" 'POST' $A $eventBody)
$eventId = Get-LastId
Expect "Recherche texte (titre de l'événement)" 200 (Invoke-Code "$GW/api/events?q=int%C3%A9gration%20$eventStamp" -Headers $P)
Check 'Recherche texte : événement trouvé' ($script:LastBody -match $eventId)
Expect "PARENT s'inscrit avec 2 enfants et un message (route Participation)" 201 (Invoke-Code "$GW/api/events/$eventId/join" 'POST' $P '{"childrenCount":2,"note":"Allergie aux arachides"}')
Expect "PROFESSIONAL ne peut pas s'inscrire" 403 (Invoke-Code "$GW/api/events/$eventId/join" 'POST' $PRO)
Expect "ADMIN ne peut pas s'inscrire" 403 (Invoke-Code "$GW/api/events/$eventId/join" 'POST' $A)
Expect 'Organisateur (ADMIN) voit les participants' 200 (Invoke-Code "$GW/api/events/$eventId/participants" -Headers $A)
Check "Participants : nom (via la Gateway) et nombre d'enfants enregistrés" (($script:LastBody -match '"participantName":"Marie Lambert"') -and ($script:LastBody -match '"childrenCount":2'))
Expect 'Autre utilisateur : participants refusés' 403 (Invoke-Code "$GW/api/events/$eventId/participants" -Headers $P)
Expect 'Catégories publiques' 200 (Invoke-Code "$GW/api/categories")
Expect 'PARENT ne crée pas de catégorie' 403 (Invoke-Code "$GW/api/categories" 'POST' $P '{"name":"Test parent","slug":"test-parent","description":"x"}')
$slug = 'integration-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Expect 'ADMIN crée une catégorie' 201 (Invoke-Code "$GW/api/categories" 'POST' $A "{`"name`":`"Intégration $slug`",`"slug`":`"$slug`",`"description`":`"Catégorie de test`"}")
$catId = Get-LastId; if (-not $catId) { $catId = 1 }
Expect 'PARENT publie un post' 201 (Invoke-Code "$GW/api/posts" 'POST' $P "{`"category_id`":$catId,`"type`":`"question`",`"title`":`"Sommeil de bébé`",`"content`":`"Quels rituels du coucher conseillez-vous ?`"}")
$postId = Get-LastId
Expect 'Post consultable sans token' 200 (Invoke-Code "$GW/api/posts/$postId")
Expect 'PROFESSIONAL commente (route Comment)' 201 (Invoke-Code "$GW/api/posts/$postId/comments" 'POST' $PRO '{"content":"Un bain tiède et une histoire aident beaucoup."}')
Expect 'Commentaires publics du post' 200 (Invoke-Code "$GW/api/posts/$postId/comments")
Expect 'PARENT signale le post (route Report)' 201 (Invoke-Code "$GW/api/posts/$postId/report" 'POST' $P '{"reason":"Test de signalement","details":"Signalement de test integration"}')
$reportId = Get-LastId
Expect 'ADMIN consulte les signalements' 200 (Invoke-Code "$GW/api/admin/reports" -Headers $A)
Expect 'Babysitting sans token' 401 (Invoke-Code "$GW/api/babysitting/requests")
Expect 'PARENT liste les demandes de babysitting' 200 (Invoke-Code "$GW/api/babysitting/requests" -Headers $P)
$bsDate = (Get-Date).AddDays(20).ToString('yyyy-MM-dd'); $bsHood = 'Quartier-test-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$bsReq = @{ date = $bsDate; start_time = '18:00:00'; end_time = '20:00:00'; neighborhood = $bsHood; num_children = 1; child_age_ranges = @('3-6') } | ConvertTo-Json -Compress
Expect 'BABYSITTER ne publie pas de demande de garde' 403 (Invoke-Code "$GW/api/babysitting/requests" 'POST' $S $bsReq)
Expect 'PARENT publie une demande de garde' 201 (Invoke-Code "$GW/api/babysitting/requests" 'POST' $P $bsReq)
$bsId = Get-LastId
Check 'Demande de garde : nom du parent enregistré' ($script:LastBody -match '"requester_name":"[^"]')
Expect 'PARENT modifie sa demande' 200 (Invoke-Code "$GW/api/babysitting/requests/$bsId" 'PUT' $P '{"num_children":2,"child_age_ranges":["3-6","6-10"],"notes":"Modifiée par le test"}')
Expect 'Modification persistée' 200 (Invoke-Code "$GW/api/babysitting/requests/$bsId" -Headers $P)
Check 'Demande relue avec la modification' ($script:LastBody -match 'Modifiée par le test')
Expect 'Un autre parent ne modifie pas la demande' 403 (Invoke-Code "$GW/api/babysitting/requests/$bsId" 'PUT' $PRO '{"notes":"x"}')
$avBody = @{ is_recurring = $false; date = $bsDate; start_time = '17:00:00'; end_time = '21:00:00'; neighborhood = $bsHood } | ConvertTo-Json -Compress
Expect 'PARENT ne publie pas de disponibilité' 403 (Invoke-Code "$GW/api/babysitting/availability" 'POST' $P $avBody)
Expect 'BABYSITTER publie une disponibilité' 201 (Invoke-Code "$GW/api/babysitting/availability" 'POST' $S $avBody)
$avId = Get-LastId
Expect 'PARENT recherche un babysitter (quartier + date)' 200 (Invoke-Code "$GW/api/babysitting/availability/search?neighborhood=$bsHood&date=$bsDate" -Headers $P)
Check 'Recherche : le babysitter disponible est trouvé' ($script:LastBody -match $avId)
Expect 'Statistiques Babysitting refusées au PARENT' 403 (Invoke-Code "$GW/api/babysitting/admin/stats" -Headers $P)
Expect 'Statistiques Babysitting (ADMIN)' 200 (Invoke-Code "$GW/api/babysitting/admin/stats" -Headers $A)
Expect 'BABYSITTER retire sa disponibilité' 204 (Invoke-Code "$GW/api/babysitting/availability/$avId" 'DELETE' $S)
Expect 'PARENT supprime sa demande' 204 (Invoke-Code "$GW/api/babysitting/requests/$bsId" 'DELETE' $P)
Expect 'Demande supprimée introuvable' 404 (Invoke-Code "$GW/api/babysitting/requests/$bsId" -Headers $P)
Expect 'Marketplace : annonces publiques' 200 (Invoke-Code "$GW/api/listings")
# Photos téléversées depuis l'ordinateur (PNG 1x1 réel) et faux fichier image refusé
$pngFile = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'pc-smoke-' + [Guid]::NewGuid() + '.png')
$fakeFile = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'pc-smoke-' + [Guid]::NewGuid() + '.jpg')
[IO.File]::WriteAllBytes($pngFile, [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'))
[IO.File]::WriteAllText($fakeFile, 'MZ ceci est un executable deguise en image')
Expect 'Marketplace : photo téléversée (multipart)' 201 (Invoke-Upload "$GW/api/listings/uploads" $P 'files' $pngFile 'image/png')
$mpImg = ($script:LastBody | ConvertFrom-Json).urls[0]
Expect 'Marketplace : faux fichier image refusé' 400 (Invoke-Upload "$GW/api/listings/uploads" $P 'files' $fakeFile 'image/jpeg')
Expect 'Marketplace : photo servie' 200 (Invoke-Code "$GW$mpImg")
$listing = @{ title = 'Poussette test'; description = 'Annonce créée par le test automatique'; category = 'PUERICULTURE'; condition = 'GOOD'; type = 'SALE'; price = 120; currency = 'TND'; images = @($mpImg); location = @{ city = 'Test'; coordinates = @(-140.12, -45.34) } }
$badListing = $listing.Clone(); $badListing.currency = 'GBP'
Expect 'Marketplace : devise inconnue refusée' 400 (Invoke-Code "$GW/api/listings" 'POST' $P ($badListing | ConvertTo-Json -Depth 5 -Compress))
Expect 'Marketplace : annonce en TND avec photo' 201 (Invoke-Code "$GW/api/listings" 'POST' $P ($listing | ConvertTo-Json -Depth 5 -Compress))
$listingId = ($script:LastBody | ConvertFrom-Json)._id
Check 'Marketplace : devise et nom du vendeur enregistrés' (($script:LastBody -match '"currency":"TND"') -and ($script:LastBody -match '"ownerName":"[^"]'))
Expect 'Marketplace : modification par le propriétaire' 200 (Invoke-Code "$GW/api/listings/$listingId" 'PUT' $P '{"price":95,"currency":"EUR"}')
Check 'Marketplace : modification persistée' (($script:LastBody -match '"price":95') -and ($script:LastBody -match '"currency":"EUR"'))
Expect 'Marketplace : modification refusée à un autre parent' 403 (Invoke-Code "$GW/api/listings/$listingId" 'PUT' $PRO '{"price":1}')
[void](Invoke-Code "$GW/api/listings?lat=-45.34&lng=-140.12&radiusKm=5")
Check 'Marketplace : annonce trouvée à proximité (5 km)' ($script:LastBody -match $listingId)
Expect 'Marketplace : statistiques ADMIN' 200 (Invoke-Code "$GW/api/listings/admin/stats" -Headers $A)
Expect 'Marketplace : statistiques refusées au PARENT' 403 (Invoke-Code "$GW/api/listings/admin/stats" -Headers $P)
# Communauté : photos de publication et modification des commentaires
Expect 'Communauté : photo téléversée' 201 (Invoke-Upload "$GW/api/posts/images" $P 'files[]' $pngFile 'image/png')
$postImg = ($script:LastBody | ConvertFrom-Json).urls[0]
Expect 'Communauté : faux fichier image refusé' 422 (Invoke-Upload "$GW/api/posts/images" $P 'files[]' $fakeFile 'image/jpeg')
$imgPostBody = @{ category_id = [int]$catId; type = 'post'; title = 'Photo de test'; content = 'Publication avec une photo de test'; images = @($postImg) } | ConvertTo-Json -Compress
Expect 'Communauté : publication avec photo' 201 (Invoke-Code "$GW/api/posts" 'POST' $P $imgPostBody)
$imgPostId = Get-LastId
Expect 'Communauté : modification de la publication' 200 (Invoke-Code "$GW/api/posts/$imgPostId" 'PUT' $P "{`"category_id`":$catId,`"type`":`"post`",`"title`":`"Photo de test modifiée`",`"images`":[]}")
Expect 'Communauté : commentaire' 201 (Invoke-Code "$GW/api/posts/$imgPostId/comments" 'POST' $PRO '{"content":"Commentaire à modifier"}')
$commentId = Get-LastId
Expect 'Communauté : modification du commentaire par son auteur' 200 (Invoke-Code "$GW/api/comments/$commentId" 'PUT' $PRO '{"content":"Commentaire modifié"}')
Expect 'Communauté : modification refusée à un autre parent' 403 (Invoke-Code "$GW/api/comments/$commentId" 'PUT' $P '{"content":"Tentative interdite"}')
# Messagerie : image jointe (participants uniquement), modification et suppression de son message
$b64 = $sitter.Split('.')[1].Replace('-', '+').Replace('_', '/'); while ($b64.Length % 4) { $b64 += '=' }
$sitterId = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json).sub
[void](Invoke-Code "$GW/api/conversations" 'POST' $P "{`"type`":`"DIRECT`",`"participants`":[`"$sitterId`"]}")
$convId = Get-LastId
Expect 'Messagerie : image jointe téléversée' 201 (Invoke-Upload "$GW/api/messages/attachments" $P 'file' $pngFile 'image/png' @{ conversation_id = $convId })
$attId = Get-LastId
Expect 'Messagerie : faux fichier image refusé' 400 (Invoke-Upload "$GW/api/messages/attachments" $P 'file' $fakeFile 'image/jpeg' @{ conversation_id = $convId })
Expect 'Messagerie : message avec image' 201 (Invoke-Code "$GW/api/messages" 'POST' $P "{`"conversation_id`":`"$convId`",`"content`":`"Voici la photo`",`"attachments`":[`"$attId`"]}")
$msgId = Get-LastId
Expect "Messagerie : le destinataire voit l'image" 200 (Invoke-Code "$GW/api/messages/attachments/$attId" -Headers $S)
Expect 'Messagerie : image refusée hors conversation' 403 (Invoke-Code "$GW/api/messages/attachments/$attId" -Headers $PRO)
Expect "Messagerie : modification par l'expéditeur" 200 (Invoke-Code "$GW/api/messages/$msgId" 'PATCH' $P '{"content":"Voici la photo (modifié)"}')
Expect 'Messagerie : modification refusée au destinataire' 403 (Invoke-Code "$GW/api/messages/$msgId" 'PATCH' $S '{"content":"pirate"}')
Expect "Messagerie : suppression par l'expéditeur" 204 (Invoke-Code "$GW/api/messages/$msgId" 'DELETE' $P)
Expect 'Messagerie : image effacée avec le message' 404 (Invoke-Code "$GW/api/messages/attachments/$attId" -Headers $S)
Expect 'Messagerie : statistiques ADMIN (sans contenu)' 200 (Invoke-Code "$GW/api/messages/admin/stats" -Headers $A)
# Administration (Gateway) : statistiques réelles agrégées et gestion des comptes Keycloak
Expect 'Statistiques administrateur (Gateway)' 200 (Invoke-Code "$GW/api/admin/stats" -Headers $A)
Check "Statistiques : tous les modules ont répondu" (-not ($script:LastBody -match '"available":false'))
Check 'Statistiques : inscriptions par jour' ($script:LastBody -match '"registrationsByDay"')
Expect 'Statistiques administrateur refusées au PARENT' 403 (Invoke-Code "$GW/api/admin/stats" -Headers $P)
Expect "Administration : recherche d'un utilisateur" 200 (Invoke-Code "$GW/api/admin/users?search=nouveau.babysitter" -Headers $A)
Check 'Administration : babysitter de test trouvé' ($script:LastBody -match $sitUserId)
Expect 'Administration : filtre par rôle BABYSITTER' 200 (Invoke-Code "$GW/api/admin/users?role=BABYSITTER" -Headers $A)
Expect "Administration : modification d'un compte" 200 (Invoke-Code "$GW/api/admin/users/$sitUserId" 'PUT' $A (@{ firstName = 'Samia'; lastName = 'Garde'; email = $sitEmail } | ConvertTo-Json -Compress))
Expect 'Administration : changement de rôle (PARENT)' 200 (Invoke-Code "$GW/api/admin/users/$sitUserId/role" 'PUT' $A '{"role":"PARENT"}')
Expect 'Administration : rôle invalide refusé' 400 (Invoke-Code "$GW/api/admin/users/$sitUserId/role" 'PUT' $A '{"role":"SUPERADMIN"}')
Expect 'Administration : suspension du compte' 200 (Invoke-Code "$GW/api/admin/users/$sitUserId/enabled" 'PUT' $A '{"enabled":false}')
Check 'Compte suspendu : connexion refusée' (-not (Get-Token $sitEmail $regPwd))
Expect 'Administration : réactivation du compte' 200 (Invoke-Code "$GW/api/admin/users/$sitUserId/enabled" 'PUT' $A '{"enabled":true}')
$ab64 = $admin.Split('.')[1].Replace('-', '+').Replace('_', '/'); while ($ab64.Length % 4) { $ab64 += '=' }
$adminId = ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ab64)) | ConvertFrom-Json).sub
Expect 'Administration : impossible de se suspendre soi-même' 409 (Invoke-Code "$GW/api/admin/users/$adminId/enabled" 'PUT' $A '{"enabled":false}')
Expect 'Administration : impossible de retirer son propre rôle ADMIN' 409 (Invoke-Code "$GW/api/admin/users/$adminId/role" 'PUT' $A '{"role":"PARENT"}')
# Microservices : Config Server, Swagger centralisé
Expect 'Config Server : configuration de Participation' 200 (Invoke-Code 'http://localhost:8888/parentconnect-participation-service/default')
Check 'Config Server : fichier du dépôt config-repo servi' ($script:LastBody -match 'config-repo/parentconnect-participation-service.yml')
[void](Invoke-Code 'http://localhost:8086/actuator/info')
Check 'Participation a chargé sa configuration depuis le Config Server' ($script:LastBody -match 'config-server')
[void](Invoke-Code 'http://localhost:8085/actuator/info')
Check 'Event a chargé sa configuration depuis le Config Server' ($script:LastBody -match 'config-server')
Expect 'Swagger UI centralisé (Gateway)' 200 (Invoke-Code "$GW/swagger-ui.html")
Expect 'OpenAPI de la Gateway' 200 (Invoke-Code "$GW/v3/api-docs")
foreach ($d in 'events', 'participations', 'babysitting', 'marketplace', 'messaging', 'geo', 'posts', 'comments', 'categories', 'reports') {
    Expect "OpenAPI via la Gateway : $d" 200 (Invoke-Code "$GW/docs/$d")
}
# Géolocalisation : quartier créé par l'ADMIN (zone unique à chaque exécution), deux parents s'y rattachent
Expect 'Géolocalisation sans token' 401 (Invoke-Code "$GW/api/geo/neighborhoods")
Expect 'PARENT liste les quartiers (route Géolocalisation)' 200 (Invoke-Code "$GW/api/geo/neighborhoods" -Headers $P)
$inv = [Globalization.CultureInfo]::InvariantCulture
$lng = [math]::Round(-150 + (Get-Random -Maximum 3000) / 10, 2); $lat = [math]::Round(-50 + (Get-Random -Maximum 1000) / 10, 2)
$ring = @(@(($lng - 0.05), ($lat - 0.05)), @(($lng + 0.05), ($lat - 0.05)), @(($lng + 0.05), ($lat + 0.05)), @(($lng - 0.05), ($lat + 0.05)), @(($lng - 0.05), ($lat - 0.05)))
$nhName = 'Quartier test ' + $lng.ToString($inv)
$nhBody = @{ name = $nhName; city = 'Démo'; boundary = @{ type = 'Polygon'; coordinates = @(, $ring) }; center = @{ type = 'Point'; coordinates = @($lng, $lat) } } | ConvertTo-Json -Depth 10 -Compress
Expect 'PARENT ne crée pas de quartier' 403 (Invoke-Code "$GW/api/geo/neighborhoods" 'POST' $P $nhBody)
Expect 'ADMIN crée un quartier' 201 (Invoke-Code "$GW/api/geo/neighborhoods" 'POST' $A $nhBody)
$nhId = Get-LastId
$mpBody = @{ neighborhood_id = $nhId; name = 'Parc de test'; type = 'park'; location = @{ type = 'Point'; coordinates = @($lng, $lat) } } | ConvertTo-Json -Depth 5 -Compress
Expect 'ADMIN ajoute un point de rencontre' 201 (Invoke-Code "$GW/api/geo/meeting-points" 'POST' $A $mpBody)
$mpId = Get-LastId
Expect 'ADMIN modifie le point de rencontre' 200 (Invoke-Code "$GW/api/geo/meeting-points/$mpId" 'PUT' $A '{"name":"Parc de test renommé"}')
Expect 'PARENT ne modifie pas un point de rencontre' 403 (Invoke-Code "$GW/api/geo/meeting-points/$mpId" 'PUT' $P '{"name":"x"}')
$lngS = $lng.ToString($inv); $latS = $lat.ToString($inv)
Expect 'Recherche de parents à 20 km' 200 (Invoke-Code "$GW/api/geo/nearby?lng=$lngS&lat=$latS&radius=20000" -Headers $A)
Expect 'Événements à proximité (lat/lng/rayon)' 200 (Invoke-Code "$GW/api/events?lat=$latS&lng=$lngS&radiusKm=20" -Headers $P)
Expect 'Statistiques Géolocalisation (ADMIN)' 200 (Invoke-Code "$GW/api/geo/admin/stats" -Headers $A)
$locBody = @{ lng = $lng; lat = $lat } | ConvertTo-Json -Compress
# Comptes admin et pro_test : les positions des parents de démonstration (Marie, Paul) ne sont pas modifiées
Expect 'admin enregistre sa position (floutée)' 200 (Invoke-Code "$GW/api/geo/locations" 'POST' $A $locBody)
Expect 'pro_test enregistre sa position dans le même quartier' 200 (Invoke-Code "$GW/api/geo/locations" 'POST' $PRO $locBody)
Check 'Position stockée floutée (précision 200 m)' ($script:LastBody -match '"precision_m":200')
Expect 'Messagerie sans token' 401 (Invoke-Code "$GW/api/notifications/unread-count")
Expect 'PARENT : notifications non lues' 200 (Invoke-Code "$GW/api/notifications/unread-count" -Headers $P)

Write-Host '== Étape 6 — RabbitMQ' -ForegroundColor Cyan
$R = @{ Authorization = $RmqAuth }
foreach ($ex in 'parentconnect.topic', 'parentconnect.events', 'parentconnect.dlx') { Expect "Exchange $ex" 200 (Invoke-Code "$RMQ/exchanges/%2F/$ex" -Headers $R) }
$null = Invoke-Code "$RMQ/exchanges/%2F/parentconnect.events/bindings/source" -Headers $R
Check 'Pont de compatibilité parentconnect.events -> parentconnect.topic' ($script:LastBody -match '"destination":"parentconnect.topic"')
Start-Sleep -Seconds 6
$null = Invoke-Code "$RMQ/exchanges/%2F/parentconnect.topic" -Headers $R
$in = 0; try { $in = ($script:LastBody | ConvertFrom-Json).message_stats.publish_in } catch { }
Check "Événements publiés sur parentconnect.topic ($in)" ($in -gt 0)
# Queues déclarées par les services (Babysitting déclare la sienne au premier événement publié)
foreach ($q in 'participation_events_queue', 'parentconnect.marketplace.queue', 'geo_events_queue', 'messaging.events', 'messaging.dlq') { Expect "Queue $q" 200 (Invoke-Code "$RMQ/queues/%2F/$q" -Headers $R) }
# Événements -> Messaging : l'organisateur (admin) est notifié de l'inscription de parent_test (étape 5)
Start-Sleep -Seconds 2
$null = Invoke-Code "$GW/api/notifications" -Headers $A
Check "Inscription à un événement -> notification de l'organisateur (Participation -> RabbitMQ -> Messaging)" (($script:LastBody -match $eventId) -and ($script:LastBody -match 'EVENT_REGISTRATION'))
# Géolocalisation -> Messaging : parent2_test est prévenu de l'arrivée d'un nouveau voisin (étape 5)
$null = Invoke-Code "$GW/api/notifications" -Headers $A
Check 'Nouveau voisin -> notification du voisin (Géolocalisation -> RabbitMQ -> Messaging)' (($script:LastBody -match 'NEW_NEIGHBOR_JOINED') -and ($script:LastBody -match [regex]::Escape($nhName)))
# Livraison de bout en bout : enveloppe standard publiée sur l'ancien exchange, relayée par le pont vers parentconnect.topic
$evt = 'smoke-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$payload = (@{ event_id = $evt; type = 'BookingAccepted'; data = @{ booking_id = $evt; requester_id = 'aaaaaaaa-0000-4000-8000-000000000003'; babysitter_id = 'aaaaaaaa-0000-4000-8000-000000000005' } } | ConvertTo-Json -Compress)
$msg = @{ properties = @{ content_type = 'application/json' }; routing_key = 'babysitting.booking.accepted'; payload = $payload; payload_encoding = 'string' } | ConvertTo-Json -Compress
$null = Invoke-Code "$RMQ/exchanges/%2F/parentconnect.events/publish" 'POST' $R $msg
Check "Événement de l'ancien exchange routé via le pont vers Messaging" ($script:LastBody -match '"routed":true')
Start-Sleep -Seconds 4
$null = Invoke-Code "$GW/api/conversations" -Headers $P
Check "Messaging a consommé l'événement (conversation créée, visible via la Gateway)" ($script:LastBody -match $evt)
# Gestion d'erreur : un message malformé part en dead-letter queue
$null = Invoke-Code "$RMQ/queues/%2F/messaging.dlq" -Headers $R; $before = ($script:LastBody | ConvertFrom-Json).messages
$bad = @{ properties = @{}; routing_key = 'babysitting.booking.accepted'; payload = 'message malformé'; payload_encoding = 'string' } | ConvertTo-Json -Compress
$null = Invoke-Code "$RMQ/exchanges/%2F/parentconnect.topic/publish" 'POST' $R $bad
Start-Sleep -Seconds 8   # les statistiques de RabbitMQ sont rafraîchies toutes les 5 s
$null = Invoke-Code "$RMQ/queues/%2F/messaging.dlq" -Headers $R; $after = ($script:LastBody | ConvertFrom-Json).messages
Check "Message malformé envoyé en DLQ (messaging.dlq : $before -> $after)" ($after -gt $before)

Write-Host '== Étape 7 — Nettoyage des données de test (la démo reste propre)' -ForegroundColor Cyan
Expect 'Signalement de test clôturé (ADMIN)' 200 (Invoke-Code "$GW/api/admin/reports/$reportId" 'PATCH' $A '{"action":"reject","notes":"Test automatique"}')
Expect 'Post de test supprimé (auteur)' 200 (Invoke-Code "$GW/api/posts/$postId" 'DELETE' $P)
Expect 'Publication avec photo supprimée (auteur)' 200 (Invoke-Code "$GW/api/posts/$imgPostId" 'DELETE' $P)
Expect 'Annonce de test supprimée (propriétaire)' 200 (Invoke-Code "$GW/api/listings/$listingId" 'DELETE' $P)
Expect 'Quartier de test supprimé (ADMIN, avec ses points de rencontre)' 204 (Invoke-Code "$GW/api/geo/neighborhoods/$nhId" 'DELETE' $A)
Expect 'Point de rencontre supprimé avec le quartier' 404 (Invoke-Code "$GW/api/geo/meeting-points/$mpId" 'DELETE' $A)
Remove-Item -LiteralPath $pngFile, $fakeFile -ErrorAction SilentlyContinue
Expect 'Catégorie de test supprimée (ADMIN)' 200 (Invoke-Code "$GW/api/categories/$catId" 'DELETE' $A)
Expect 'Événement de test annulé (ADMIN)' 204 (Invoke-Code "$GW/api/events/$eventId" 'DELETE' $A)
$kcAdminToken = $null
try {
    $kcAdminToken = (Invoke-RestMethod -Method Post -Uri "$KC/realms/master/protocol/openid-connect/token" -Body @{
        grant_type = 'password'; client_id = 'admin-cli'; username = (Get-EnvValue 'KEYCLOAK_ADMIN'); password = (Get-EnvValue 'KEYCLOAK_ADMIN_PASSWORD') }).access_token
} catch { }
Expect 'Compte de test supprimé de Keycloak' 204 (Invoke-Code "$KC/admin/realms/parentconnect/users/$regUserId" 'DELETE' @{ Authorization = "Bearer $kcAdminToken" })
Expect 'Babysitter de test supprimé de Keycloak' 204 (Invoke-Code "$KC/admin/realms/parentconnect/users/$sitUserId" 'DELETE' @{ Authorization = "Bearer $kcAdminToken" })

Write-Host ''
Write-Host "Résultat : $($script:Pass) réussite(s), $($script:Fail) échec(s)"
$script:Failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
if ($script:Fail -gt 0) { exit 1 }
