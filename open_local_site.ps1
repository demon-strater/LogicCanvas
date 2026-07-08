$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not $env:OPENAI_API_KEY) {
  $env:OPENAI_API_KEY = "sk-local-placeholder"
}

if (-not $env:NOTION_API_KEY) {
  $env:NOTION_API_KEY = ""
}

docker compose up -d --build

$url = "http://127.0.0.1:5000"
$deadline = (Get-Date).AddSeconds(60)

do {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      Start-Process $url
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 2
  }
} while ((Get-Date) -lt $deadline)

throw "LogicCanvas did not respond at $url within 60 seconds."
