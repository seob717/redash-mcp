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

  log_info "nvm으로 Node.js 설치 중..."
  export NVM_DIR="$HOME/.nvm"

  # nvm이 이미 설치되어 있으면 로드, 없으면 설치
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
  else
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  fi

  if command -v nvm &>/dev/null; then
    nvm install --lts
    nvm alias default node
    log_success "Node.js $(node --version) 설치 완료"
  else
    log_error "nvm 설치에 실패했습니다."
    echo ""
    echo "  → https://nodejs.org 에서 직접 설치해주세요."
    exit 1
  fi
fi

# ── STEP 2: Claude Desktop ────────────────────────────────────────────────────
log_step "Claude Desktop 확인 중..."

if [ "$OS" = "Darwin" ]; then
  if [ -d "/Applications/Claude.app" ]; then
    log_success "Claude Desktop이 이미 설치되어 있습니다."
  else
    log_warn "Claude Desktop이 설치되어 있지 않습니다."
    log_info "최신 버전 확인 중..."
    CLAUDE_URL=$(curl -fsSL "https://downloads.claude.ai/releases/darwin/universal/RELEASES.json" \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['releases'][0]['updateTo']['url'])" 2>/dev/null)

    if [ -n "$CLAUDE_URL" ]; then
      log_info "Claude Desktop 다운로드 중..."
      if curl -fSL -o /tmp/Claude.zip "$CLAUDE_URL"; then
        log_info "Claude Desktop 설치 중..."
        unzip -qo /tmp/Claude.zip -d /tmp/Claude_install
        cp -R /tmp/Claude_install/Claude.app /Applications/
        rm -rf /tmp/Claude.zip /tmp/Claude_install
        log_success "Claude Desktop 설치 완료"
      else
        log_error "Claude Desktop 다운로드 실패"
        echo "  → https://claude.ai/download 에서 직접 설치해주세요."
      fi
    else
      log_error "Claude Desktop 최신 버전 확인 실패"
      echo "  → https://claude.ai/download 에서 직접 설치해주세요."
    fi
  fi
else
  log_warn "Linux는 Claude Desktop을 공식 지원하지 않습니다. 이 단계를 건너뜁니다."
fi

# ── STEP 3: MCP 설정 ──────────────────────────────────────────────────────────
log_step "MCP 서버 설정을 시작합니다."
echo ""

# 설치 대상 선택
echo -e "  ${BOLD}설치 대상을 선택하세요:${NC}"
echo "    1) Claude Desktop"
echo "    2) Claude Code (CLI)"
echo "    3) 둘 다"
echo ""
printf "  선택 [1/2/3]: "
read -r TARGET_CHOICE </dev/tty

case "$TARGET_CHOICE" in
  1) INSTALL_DESKTOP=true;  INSTALL_CLI=false ;;
  2) INSTALL_DESKTOP=false; INSTALL_CLI=true  ;;
  3) INSTALL_DESKTOP=true;  INSTALL_CLI=true  ;;
  *)
    log_error "올바른 번호를 입력해주세요 (1, 2, 또는 3)."
    exit 1
    ;;
esac

# Redash URL 입력
while true; do
  printf "  Redash URL을 입력하세요 (예: https://redash.example.com): "
  read -r REDASH_URL </dev/tty
  if [ -z "$REDASH_URL" ]; then
    log_warn "URL을 입력해주세요."
  elif [[ "$REDASH_URL" != http://* && "$REDASH_URL" != https://* ]]; then
    log_warn "http:// 또는 https://로 시작해야 합니다."
  else
    # 마지막 슬래시 제거
    REDASH_URL="${REDASH_URL%/}"
    break
  fi
done

# Redash API 키 입력
while true; do
  printf "  Redash API 키를 입력하세요: "
  read -r REDASH_API_KEY </dev/tty
  if [ -z "$REDASH_API_KEY" ]; then
    log_warn "API 키를 입력해주세요."
  else
    break
  fi
done

# JSON 병합 함수 (jq 우선, python3 폴백)
merge_mcp_config() {
  local config_path="$1"
  local url="$2"
  local api_key="$3"

  # 디렉토리 생성
  mkdir -p "$(dirname "$config_path")"

  if command -v jq &>/dev/null; then
    # jq로 병합
    local tmp
    tmp="$(mktemp)"
    if [ -f "$config_path" ]; then
      jq --arg url "$url" --arg key "$api_key" \
        '.mcpServers["redash-mcp"] = {
          "command": "npx",
          "args": ["-y", "redash-mcp"],
          "env": {
            "REDASH_URL": $url,
            "REDASH_API_KEY": $key
          }
        }' "$config_path" > "$tmp"
    else
      jq -n --arg url "$url" --arg key "$api_key" \
        '{
          "mcpServers": {
            "redash-mcp": {
              "command": "npx",
              "args": ["-y", "redash-mcp"],
              "env": {
                "REDASH_URL": $url,
                "REDASH_API_KEY": $key
              }
            }
          }
        }' > "$tmp"
    fi
    mv "$tmp" "$config_path"
  elif command -v python3 &>/dev/null; then
    # python3으로 병합
    python3 - "$config_path" "$url" "$api_key" <<'PYEOF'
import sys, json, os

config_path, url, api_key = sys.argv[1], sys.argv[2], sys.argv[3]

config = {}
if os.path.exists(config_path):
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

config.setdefault("mcpServers", {})
config["mcpServers"]["redash-mcp"] = {
    "command": "npx",
    "args": ["-y", "redash-mcp"],
    "env": {
        "REDASH_URL": url,
        "REDASH_API_KEY": api_key
    }
}

with open(config_path, "w", encoding="utf-8") as f:
    json.dump(config, f, indent=2, ensure_ascii=False)
    f.write("\n")
PYEOF
  else
    log_error "jq 또는 python3이 필요합니다. 설치 후 다시 시도해주세요."
    exit 1
  fi
}

# Claude Desktop 설정
if [ "$INSTALL_DESKTOP" = true ]; then
  if [ "$OS" = "Darwin" ]; then
    DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
  else
    DESKTOP_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
  fi

  log_info "Claude Desktop 설정 중..."
  if merge_mcp_config "$DESKTOP_CONFIG" "$REDASH_URL" "$REDASH_API_KEY"; then
    log_success "Claude Desktop 설정 완료: $DESKTOP_CONFIG"
  else
    log_error "Claude Desktop 설정 실패"
    exit 1
  fi
fi

# Claude Code CLI 설정
if [ "$INSTALL_CLI" = true ]; then
  CLI_CONFIG="$HOME/.claude/settings.json"

  log_info "Claude Code (CLI) 설정 중..."
  if merge_mcp_config "$CLI_CONFIG" "$REDASH_URL" "$REDASH_API_KEY"; then
    log_success "Claude Code (CLI) 설정 완료: $CLI_CONFIG"
  else
    log_error "Claude Code (CLI) 설정 실패"
    exit 1
  fi
fi

echo ""
log_success "설치가 완료되었습니다. Claude를 재시작하면 redash-mcp를 사용할 수 있습니다."
echo ""
log_warn "nvm으로 Node.js를 설치한 경우, 터미널을 새로 열어야 node 명령어가 인식됩니다."
echo ""
