$ErrorActionPreference = "Stop"

Write-Output "[1/3] Build workspace"
& npm.cmd run build

Write-Output "[2/3] Run API tests"
& npm.cmd run test -w apps/api -- --runInBand

Write-Output "[3/3] Smoke checks"
$web = (Invoke-WebRequest -UseBasicParsing http://localhost:3000/dashboard).StatusCode
$api = (Invoke-WebRequest -UseBasicParsing -Headers @{"x-user-role"="agent";"x-user-id"="u-agent"} http://localhost:3001/dashboard/summary).StatusCode

Write-Output "Web status: $web"
Write-Output "API status: $api"
Write-Output "Release check completed"
