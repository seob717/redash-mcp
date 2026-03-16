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

# 설치 대상 선택
Write-Host "  설치 대상을 선택하세요:" -ForegroundColor White
Write-Host "    1) Claude Desktop"
Write-Host "    2) Claude Code (CLI)"
Write-Host "    3) 둘 다"
Write-Host ""
$targetChoice = Read-Host "  선택 [1/2/3]"

switch ($targetChoice) {
  "1" { $installDesktop = $true;  $installCli = $false }
  "2" { $installDesktop = $false; $installCli = $true  }
  "3" { $installDesktop = $true;  $installCli = $true  }
  default {
    Write-Fail "올바른 번호를 입력해주세요 (1, 2, 또는 3)."
    exit 1
  }
}

# Redash URL 입력
$redashUrl = ""
while ($true) {
  $redashUrl = Read-Host "  Redash URL을 입력하세요 (예: https://redash.example.com)"
  if ([string]::IsNullOrWhiteSpace($redashUrl)) {
    Write-Warn "URL을 입력해주세요."
  } elseif (-not ($redashUrl.StartsWith("http://") -or $redashUrl.StartsWith("https://"))) {
    Write-Warn "http:// 또는 https://로 시작해야 합니다."
  } else {
    # 마지막 슬래시 제거
    $redashUrl = $redashUrl.TrimEnd("/")
    break
  }
}

# Redash API 키 입력
$redashApiKey = ""
while ($true) {
  $redashApiKey = Read-Host "  Redash API 키를 입력하세요"
  if ([string]::IsNullOrWhiteSpace($redashApiKey)) {
    Write-Warn "API 키를 입력해주세요."
  } else {
    break
  }
}

# MCP 엔트리 오브젝트 생성
$mcpEntry = [ordered]@{
  command = "npx"
  args    = @("-y", "redash-mcp")
  env     = [ordered]@{
    REDASH_URL     = $redashUrl
    REDASH_API_KEY = $redashApiKey
  }
}

# JSON 병합 함수
function Merge-McpConfig {
  param(
    [string]$ConfigPath,
    [hashtable]$McpEntry
  )

  # 디렉토리 생성
  $dir = Split-Path $ConfigPath -Parent
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  # 기존 설정 읽기 또는 새 오브젝트 생성
  if (Test-Path $ConfigPath) {
    $raw = Get-Content $ConfigPath -Raw -Encoding UTF8
    $config = $raw | ConvertFrom-Json
    # PSCustomObject를 hashtable로 변환 (병합 가능하도록)
    $configHash = @{}
    $config.PSObject.Properties | ForEach-Object { $configHash[$_.Name] = $_.Value }
  } else {
    $configHash = @{}
  }

  # mcpServers 키 확보
  if (-not $configHash.ContainsKey("mcpServers") -or $null -eq $configHash["mcpServers"]) {
    $configHash["mcpServers"] = @{}
  } else {
    # PSCustomObject -> hashtable 변환
    $existing = $configHash["mcpServers"]
    if ($existing -is [System.Management.Automation.PSCustomObject]) {
      $msHash = @{}
      $existing.PSObject.Properties | ForEach-Object { $msHash[$_.Name] = $_.Value }
      $configHash["mcpServers"] = $msHash
    }
  }

  # redash-mcp 엔트리 설정
  $configHash["mcpServers"]["redash-mcp"] = $McpEntry

  # JSON 직렬화 (깊이 100으로 설정해 중첩 객체가 잘리지 않도록)
  $json = $configHash | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($ConfigPath, $json + "`n", [System.Text.Encoding]::UTF8)
}

# Claude Desktop 설정
if ($installDesktop) {
  $desktopConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"

  Write-Info "Claude Desktop 설정 중..."
  try {
    Merge-McpConfig -ConfigPath $desktopConfig -McpEntry $mcpEntry
    Write-Success "Claude Desktop 설정 완료: $desktopConfig"
  } catch {
    Write-Fail "Claude Desktop 설정 실패: $_"
    exit 1
  }
}

# Claude Code CLI 설정
if ($installCli) {
  $cliConfig = Join-Path $env:USERPROFILE ".claude\settings.json"

  Write-Info "Claude Code (CLI) 설정 중..."
  try {
    Merge-McpConfig -ConfigPath $cliConfig -McpEntry $mcpEntry
    Write-Success "Claude Code (CLI) 설정 완료: $cliConfig"
  } catch {
    Write-Fail "Claude Code (CLI) 설정 실패: $_"
    exit 1
  }
}

Write-Host ""
Write-Success "설치가 완료되었습니다. Claude를 재시작하면 redash-mcp를 사용할 수 있습니다."
Write-Host ""
