$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

# ── Check .env ────────────────────────────────────────────────────────────────
if (-not (Test-Path "$Backend\.env")) {
    if (Test-Path "$Backend\.env.example") {
        Copy-Item "$Backend\.env.example" "$Backend\.env"
        Write-Host ""
        Write-Host "  [ACTION] .env created from .env.example" -ForegroundColor Yellow
        Write-Host "  Edit backend\.env and add your API keys, then run again." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ── Start both servers ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  AI Prompt Optimizer" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Starting backend  → http://localhost:8000" -ForegroundColor Green
Write-Host "  Starting frontend → http://localhost:3001" -ForegroundColor Green
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Press Ctrl+C to stop both servers." -ForegroundColor DarkGray
Write-Host ""

$backendJob = Start-Job -Name "Backend" -ScriptBlock {
    param($path)
    Set-Location $path
    python -m uvicorn main:app --port 8000 --reload 2>&1
} -ArgumentList $Backend

$frontendJob = Start-Job -Name "Frontend" -ScriptBlock {
    param($path)
    Set-Location $path
    npm run dev -- -p 3001 2>&1
} -ArgumentList $Frontend

# Wait a moment then open browser
Start-Sleep -Seconds 6
Start-Process "http://localhost:3001"

# ── Stream output from both jobs ──────────────────────────────────────────────
try {
    while ($true) {
        $backendOut = Receive-Job -Job $backendJob
        if ($backendOut) {
            $backendOut | ForEach-Object { Write-Host "[API] $_" -ForegroundColor DarkCyan }
        }

        $frontendOut = Receive-Job -Job $frontendJob
        if ($frontendOut) {
            $frontendOut | ForEach-Object { Write-Host "[UI] $_" -ForegroundColor DarkGreen }
        }

        # Exit if either job stopped unexpectedly
        if ($backendJob.State -eq "Failed") {
            Write-Host "[ERROR] Backend stopped. Check output above." -ForegroundColor Red
            break
        }
        if ($frontendJob.State -eq "Failed") {
            Write-Host "[ERROR] Frontend stopped. Check output above." -ForegroundColor Red
            break
        }

        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host ""
    Write-Host "  Stopping servers..." -ForegroundColor Yellow
    Stop-Job -Job $backendJob, $frontendJob
    Remove-Job -Job $backendJob, $frontendJob -Force
    Write-Host "  Done." -ForegroundColor Gray
}
