#!/usr/bin/env bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "  ${BLUE}ℹ${NC}  $1"; }
log_success() { echo -e "  ${GREEN}✓${NC}  $1"; }
log_warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
log_error()   { echo -e "  ${RED}✗${NC}  $1"; }
log_step()    { echo -e "\n${BOLD}▶ $1${NC}"; }
ask()         { printf "  $1 [y/N] "; read -r REPLY </dev/tty; echo "$REPLY"; }

echo ""
echo -e "  ${BOLD}redash-mcp 설치 마법사${NC}"
echo ""

OS="$(uname -s)"

# Homebrew가 non-interactive shell에서도 인식되도록 PATH에 추가
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ── STEP 1: Node.js ───────────────────────────────────────────────────────────
log_step "Node.js 확인 중..."

if command -v node &>/dev/null; then
  log_success "Node.js $(node --version) 이미 설치되어 있습니다."
else
  log_warn "Node.js가 설치되어 있지 않습니다."

  NODE_INSTALLED=false

  if [ "$OS" = "Darwin" ]; then
    if command -v brew &>/dev/null; then
      log_info "Homebrew로 Node.js 설치 중..."
      if brew install node; then
        NODE_INSTALLED=true
      fi
    else
      log_error "Homebrew를 찾을 수 없습니다."
      echo ""
      echo "  → https://nodejs.org 에서 Node.js를 설치한 후 다시 실행해주세요."
      exit 1
    fi
  else
    # Linux: 패키지 매니저 순서대로 시도
    if command -v apt-get &>/dev/null; then
      log_info "apt로 Node.js 설치 중..."
      sudo apt-get install -y nodejs && NODE_INSTALLED=true
    elif command -v dnf &>/dev/null; then
      log_info "dnf로 Node.js 설치 중..."
      sudo dnf install -y nodejs && NODE_INSTALLED=true
    elif command -v yum &>/dev/null; then
      log_info "yum으로 Node.js 설치 중..."
      sudo yum install -y nodejs && NODE_INSTALLED=true
    else
      log_error "패키지 매니저를 찾을 수 없습니다."
      echo ""
      echo "  → https://nodejs.org 에서 Node.js를 설치한 후 다시 실행해주세요."
      exit 1
    fi
  fi

  if [ "$NODE_INSTALLED" = true ]; then
    log_success "Node.js 설치 완료"
    # 설치 후 PATH 갱신
    export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  else
    log_error "Node.js 설치에 실패했습니다."
    echo ""
    echo "  → https://nodejs.org 에서 직접 설치해주세요."
    exit 1
  fi
fi

# ── STEP 2: Claude Desktop ────────────────────────────────────────────────────
log_step "Claude Desktop 확인 중..."

if [ "$OS" = "Darwin" ]; then
  if [ -d "/Applications/Claude.app" ] || [ -d "$HOME/Applications/Claude.app" ]; then
    log_success "Claude Desktop이 이미 설치되어 있습니다."
  else
    log_warn "Claude Desktop이 설치되어 있지 않습니다."
    REPLY=$(ask "자동으로 설치할까요?")
    if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
      if command -v brew &>/dev/null; then
        log_info "Homebrew로 Claude Desktop 설치 중... (관리자 권한이 필요할 수 있습니다)"
        if brew install --cask claude; then
          log_success "Claude Desktop 설치 완료"
        else
          log_error "Claude Desktop 설치 실패"
          echo "  → https://claude.ai/download 에서 직접 설치해주세요."
        fi
      else
        echo "  → https://claude.ai/download 에서 직접 설치해주세요."
      fi
    else
      log_info "건너뜁니다. 나중에 https://claude.ai/download 에서 설치해주세요."
    fi
  fi
else
  log_warn "Linux는 Claude Desktop을 공식 지원하지 않습니다. 이 단계를 건너뜁니다."
fi

# ── STEP 3: MCP 설정 ──────────────────────────────────────────────────────────
log_step "MCP 서버 설정을 시작합니다."
echo ""

npx --yes redash-mcp setup
