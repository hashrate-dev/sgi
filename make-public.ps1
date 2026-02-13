# Script para hacer público el repositorio hashrate-dev/sgi
# Necesitas un Personal Access Token de GitHub

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$headers = @{
    'Accept' = 'application/vnd.github+json'
    'Authorization' = "Bearer $Token"
    'X-GitHub-Api-Version' = '2022-11-28'
}

$body = @{
    private = $false
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri 'https://api.github.com/repos/hashrate-dev/sgi' -Method PATCH -Headers $headers -Body $body -ContentType 'application/json'
    Write-Host "✅ Repositorio ahora es PÚBLICO!" -ForegroundColor Green
    Write-Host "URL: $($response.html_url)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "Token inválido o sin permisos suficientes" -ForegroundColor Yellow
    } elseif ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "Repositorio no encontrado o sin acceso" -ForegroundColor Yellow
    }
}
