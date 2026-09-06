$env:SKILL_RUNNER_TOKEN = "localdev"
$env:WORK_DIR = "C:\Users\shiva\Desktop\BMT\bmt-app-new"

Write-Host "Skill-runner auto-restart. Zatrzymaj: Ctrl+C" -ForegroundColor DarkGray

while ($true) {
    Write-Host "$(Get-Date -Format 'HH:mm:ss') [START]" -ForegroundColor Cyan
    try {
        node "$PSScriptRoot\server.js"
    } catch {
        Write-Host "Blad: $_" -ForegroundColor Red
    }
    Write-Host "$(Get-Date -Format 'HH:mm:ss') [STOP] Restart za 3s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}
