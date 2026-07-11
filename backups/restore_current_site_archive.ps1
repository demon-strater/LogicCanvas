$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$archive = Join-Path $root "backups\current_site_archive_20260711.sql"

Set-Location $root

docker compose up -d db
docker compose exec -T db psql -U postgres -d postgres -c "TRUNCATE TABLE edges, tasks, nodes, document_edges, group_edges, documents, document_groups RESTART IDENTITY CASCADE;"
Get-Content $archive | docker compose exec -T db psql -U postgres -d postgres
docker compose up -d --build

Write-Host "Restored current site archive from $archive"
