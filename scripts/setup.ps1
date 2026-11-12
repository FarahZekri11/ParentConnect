# =====================================================================
# ParentConnect — préparation de l'environnement (Windows / PowerShell)
# Usage (depuis la racine du projet) :  .\scripts\setup.ps1
#        régénérer clés et secrets :     .\scripts\setup.ps1 -Force
# Seul prérequis : Docker Desktop démarré.
# =====================================================================
param([switch]$Force)

$root = Split-Path -Parent $PSScriptRoot
$forceArg = if ($Force) { "--force" } else { "" }

docker run --rm -v "${root}:/work" -w /work node:20-alpine node scripts/setup.js $forceArg
if ($LASTEXITCODE -ne 0) { Write-Error "La préparation a échoué."; exit 1 }
