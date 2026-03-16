# redash-mcp 설치 마법사 (Windows PowerShell)
$ErrorActionPreference = "Stop"

function Write-Step    { Write-Host "`n▶ $args" -ForegroundColor White -BackgroundColor DarkGray }
function Write-Info    { Write-Host "  ℹ  $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "  ✓  $args" -ForegroundColor Green }
function Write-Warn    { Write-Host "  ⚠  $args" -ForegroundColor Yellow }
function Write-Fail    { Write-Host "  ✗  $args" -ForegroundColor Red }

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Has-Command($cmd) {
  return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

Write-Host ""
Write-Host "  redash-mcp 설치 마법사" -ForegroundColor White
Write-Host ""

# ── STEP 1: Node.js ───────────────────────────────────────────────────────────
Write-Step "Node.js 확인 중..."

if (Has-Command "node") {
  $nodeVersion = node --version
  Write-Success "Node.js $nodeVersion 이미 설치되어 있습니다."
} else {
  Write-Warn "Node.js가 설치되어 있지 않습니다."

  if (Has-Command "winget") {
    Write-Info "winget으로 Node.js 설치 중..."
    winget install -e --id OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements

    # 현재 세션 PATH 갱신 (터미널 재시작 불필요)
    Refresh-Path

    if (Has-Command "node") {
      Write-Success "Node.js 설치 완료"
    } else {
      Write-Fail "Node.js 설치 후에도 인식되지 않습니다."
      Write-Host "  → 터미널을 재시작한 후 다시 실행해주세요."
      exit 1
    }
  } else {
    Write-Fail "winget을 찾을 수 없습니다."
    Write-Host "  → https://nodejs.org 에서 Node.js를 설치한 후 다시 실행해주세요."
    exit 1
  }
}

# ── STEP 2: Claude Desktop ────────────────────────────────────────────────────
Write-Step "Claude Desktop 확인 중..."

$claudePath = Join-Path $env:LOCALAPPDATA "AnthropicClaude"

if (Test-Path $claudePath) {
  Write-Success "Claude Desktop이 이미 설치되어 있습니다."
} else {
  Write-Warn "Claude Desktop이 설치되어 있지 않습니다."
  $answer = Read-Host "  자동으로 설치할까요? [y/N]"

  if ($answer -eq "y" -or $answer -eq "Y") {
    if (Has-Command "winget") {
      Write-Info "winget으로 Claude Desktop 설치 중..."
      try {
        winget install -e --id Anthropic.Claude --silent --accept-package-agreements --accept-source-agreements
        Write-Success "Claude Desktop 설치 완료"
      } catch {
        Write-Fail "Claude Desktop 설치 실패"
        Write-Host "  → https://claude.ai/download 에서 직접 설치해주세요."
      }
    } else {
      Write-Host "  → https://claude.ai/download 에서 직접 설치해주세요."
    }
  } else {
    Write-Info "건너뜁니다. 나중에 https://claude.ai/download 에서 설치해주세요."
  }
}

# ── STEP 3: MCP 설정 ──────────────────────────────────────────────────────────
Write-Step "MCP 서버 설정을 시작합니다."
Write-Host ""

npx --yes redash-mcp setup
