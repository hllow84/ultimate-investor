Write-Host "Starting Ultimate Investor..." -ForegroundColor Cyan

# Backend
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd 'C:\Claude Code\Ultimate Investor\backend'; Write-Host 'Backend starting...' -ForegroundColor Green; .venv\Scripts\uvicorn.exe app.main:app --reload --port 8000"
) -WindowStyle Normal

Start-Sleep -Seconds 2

# Frontend
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd 'C:\Claude Code\Ultimate Investor\frontend'; Write-Host 'Frontend starting...' -ForegroundColor Green; npm run dev"
) -WindowStyle Normal

Write-Host "Both servers launching in separate windows." -ForegroundColor Cyan
Write-Host "  Backend  -> http://localhost:8000" -ForegroundColor Yellow
Write-Host "  Frontend -> http://localhost:5173" -ForegroundColor Yellow
Write-Host "  API docs -> http://localhost:8000/docs" -ForegroundColor Yellow
