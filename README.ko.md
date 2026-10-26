# redash-mcp

[![npm version](https://img.shields.io/npm/v/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Downloads](https://img.shields.io/npm/dm/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Node](https://img.shields.io/node/v/redash-mcp.svg)](https://nodejs.org)
[![Glama](https://glama.ai/mcp/servers/seob717/redash-mcp/badges/score.svg)](https://glama.ai/mcp/servers/seob717/redash-mcp)
[![Claude](https://img.shields.io/badge/Claude-Compatible-D97757?logo=claude&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
[![Cursor](https://img.shields.io/badge/Cursor-Compatible-111111)](https://github.com/seob717/redash-mcp#installation)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-Compatible-4285F4?logo=googlegemini&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-Compatible-412991?logo=openai&logoColor=white)](https://github.com/seob717/redash-mcp#installation)

[English](README.md) | 한국어 | [日本語](README.ja.md)

> [Redash](https://redash.io)를 Claude, Cursor, Gemini CLI, Codex 등 모든 MCP 클라이언트에 연결하는 MCP 서버 — 자연어로 데이터를 조회하고, 차트와 대시보드를 만들고, SQL을 실행합니다.

[설치](#설치) · [툴](#툴) · [환경 변수](#환경-변수) · [사용 예시](#사용-예시) · [문제 해결](#문제-해결) · [Privacy](#privacy-policy)

> 영문 README와 마지막 동기화: 2026-10-26

## 3.5 새 기능

- **`create_visualization`** — 저장된 쿼리에 라인 / 막대 / 영역 / 파이 / 산점도 차트나 숫자 카드(counter)를 만듭니다. 컬럼명을 최신 결과와 대조하므로, 오타가 있으면 빈 차트 대신 오류를 돌려줍니다.
- **대시보드 자동 배치** — `add_widget`이 새 위젯을 기존 위젯 아래에 놓고, 반폭 위젯은 두 개씩 나란히 배치합니다(이전에는 모두 왼쪽 위에 겹쳐 놓였습니다).

전체 변경 이력: [Releases](https://github.com/seob717/redash-mcp/releases)

## 왜 redash-mcp인가?

LLM이 **운영(production) 데이터**를 안전하게 다루도록 만드는 데 초점을 맞췄습니다:

- **🛡️ SQL 안전 가드** — `DROP`/`TRUNCATE`/`ALTER`, `WHERE` 없는 `DELETE`/`UPDATE`를 차단합니다. `strict`/`warn`/`off` 모드, PII 감지, 자동 `LIMIT`을 지원합니다.
- **🧠 BIRD 스마트 쿼리** — 질문을 분석해 테이블을 자동 선택하고 SQL 생성을 가이드합니다([BIRD text-to-SQL](https://bird-bench.github.io/)). Claude Haiku 폴백은 선택 사항입니다.
- **📊 처음부터 끝까지** — 조회, 저장, 차트, 대시보드, 알림까지 25개 툴.
- **⚡ 한 번의 명령으로 설치** — `npx redash-mcp setup`이 Claude Desktop / Claude Code / Cursor / Gemini CLI / Codex CLI 설정을 잡아줍니다.
- **🔒 완전 로컬** — Redash와 직접 통신하며, API 키와 결과가 기기를 벗어나지 않습니다.

## 설치

**요구 사항:** Node.js 20 이상, Redash API 키(Redash → 프로필 → **Edit Profile** → **API Key**).

```bash
npx redash-mcp setup
```

설정 마법사가 Claude Desktop, Claude Code, Cursor, Gemini CLI, Codex CLI 중 원하는 조합을 설정해 줍니다.

Node.js, Claude Desktop, MCP 설정을 한 번에 처리하려면:

```bash
curl -fsSL https://raw.githubusercontent.com/seob717/redash-mcp/main/install.sh | bash
```

<details>
<summary><b>수동 설치</b></summary>

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`
**Cursor** — `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "redash-mcp": {
      "command": "npx",
      "args": ["-y", "redash-mcp"],
      "env": {
        "REDASH_URL": "https://your-redash-instance.com",
        "REDASH_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

저장 후 Claude Desktop을 완전히 종료했다가 다시 시작합니다.

**Claude Code**

```bash
claude mcp add --scope user redash-mcp \
  -e REDASH_URL=https://your-redash-instance.com \
  -e REDASH_API_KEY=your_api_key_here \
  -- npx -y redash-mcp
```

**Gemini CLI**

```bash
gemini mcp add -s user \
  -e REDASH_URL=https://your-redash-instance.com \
  -e REDASH_API_KEY=your_api_key_here \
  redash-mcp npx -y redash-mcp
```

**Codex CLI**

```bash
codex mcp add redash-mcp \
  --env REDASH_URL=https://your-redash-instance.com \
  --env REDASH_API_KEY=your_api_key_here \
  -- npx -y redash-mcp
```

</details>

## 툴

| 카테고리 | 툴 |
|---|---|
| 데이터소스·스키마 | `list_data_sources`, `list_tables`, `get_table_columns` |
| 쿼리 실행 | `run_query` — SQL 실행 후 결과 반환 |
| 저장 쿼리 | `list_queries`, `get_query`, `get_query_result`(파라미터 값 지정 가능), `create_query`, `update_query`, `fork_query`, `archive_query` |
| 차트 | `create_visualization` — 라인 / 막대 / 영역 / 파이 / 산점도 / 숫자 카드 |
| 대시보드 | `list_dashboards`, `get_dashboard`, `create_dashboard`, `add_widget`(자동 배치) |
| 알림 | `list_alerts`, `get_alert`, `create_alert` |
| 스마트 쿼리(BIRD) | `smart_query`, `get_bird_config`, `evaluate_queries`, `submit_query_feedback`, `manage_few_shot_examples`, `manage_keyword_map` |

### SQL 안전 가드

- **항상 차단**: `DROP`, `TRUNCATE`, `ALTER TABLE`, `GRANT/REVOKE`, `WHERE` 없는 `DELETE/UPDATE`
- **경고(`warn`) / 차단(`strict`)**: `SELECT *`, `WHERE`·`LIMIT` 없는 쿼리, PII 컬럼 접근
- **자동 LIMIT**: `REDASH_AUTO_LIMIT` 설정 시 `LIMIT N` 추가

자세한 내용: [docs/sql-safety-guard.md](docs/sql-safety-guard.md). 쿼리 결과는 메모리에도 캐싱됩니다(아래 `REDASH_MCP_CACHE_*` 참고).

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `REDASH_URL` | **필수** | Redash 인스턴스 URL (예: `https://redash.example.com`) |
| `REDASH_API_KEY` | **필수** | Redash 사용자 API 키 |
| `REDASH_SAFETY_MODE` | `warn` | SQL 안전 수준: `off` / `warn` / `strict` |
| `REDASH_SAFETY_DISABLE_PII` | `false` | PII 감지 비활성화 |
| `REDASH_SAFETY_DISABLE_COST` | `false` | 비용 경고 비활성화 |
| `REDASH_AUTO_LIMIT` | `0` | LIMIT 없는 쿼리에 `LIMIT N` 자동 추가 (0 = 끔) |
| `REDASH_DEFAULT_MAX_AGE` | `0` | Redash 캐시 TTL (초) |
| `REDASH_MCP_CACHE_TTL` | `300` | MCP 쿼리 캐시 TTL (초, 0 = 끔) |
| `REDASH_MCP_CACHE_MAX_MB` | `50` | MCP 쿼리 캐시 최대 메모리 (MB) |
| `REDASH_MCP_CONFIG_DIR` | `~/.redash-mcp` | BIRD few-shot·피드백·평가·키워드맵 저장 디렉터리 |
| `REDASH_BIRD_ENABLED` | `true` | `false`면 BIRD 스마트 쿼리 툴 비활성화 |
| `REDASH_HTTP_TIMEOUT_SECS` | `30` | Redash API 요청별 HTTP 타임아웃 |
| `ANTHROPIC_API_KEY` | — | 설정하면 `smart_query`의 테이블 선택에 Claude Haiku 폴백 사용 |

## 사용 예시

자연어로 요청하면 됩니다:

- "이번 달 신규 가입자 수 알려줘" → `smart_query`가 테이블 선택 → `run_query`
- "지난주 신규 가입자 중 결제한 사용자 비율은?" → `smart_query`가 JOIN 가이드 → `run_query`
- "일별 가입자 수가 100명 아래로 떨어지면 알림 만들어줘" → `create_alert`

**대시보드 만들기:** "월별 매출 쿼리를 저장하고, 라인 차트로 만들어서 새 매출 대시보드에 올려줘"

1. `create_query` — "월별 매출" 저장
2. `create_visualization` — `type: "line"`, `x_column: "month"`, `y_columns: ["revenue"]`
3. `create_dashboard` — "매출" 대시보드 생성
4. `add_widget` — 차트 배치. 위젯을 더 추가하면 아래로 쌓이거나 두 개씩 나란히 놓입니다

## 문제 해결

| 증상 | 해결 |
|---|---|
| `npx`를 못 찾음 (macOS GUI 앱) | `which npx`로 전체 경로를 확인해 `command`에 넣으세요 |
| "Authentication failed" | `REDASH_API_KEY`가 사용자 API 키인지 확인하세요 |
| "Unable to connect to the Redash server" | `REDASH_URL`(`https://` 포함, `/api` 제외)과 네트워크·VPN을 확인하세요 |
| "The query timed out" | 쿼리를 단순화하거나 `run_query`에 더 큰 `timeout_secs`를 넘기세요. API 응답이 느리면 `REDASH_HTTP_TIMEOUT_SECS`를 늘리세요 |
| 안전 가드가 쿼리를 차단함 | `WHERE`/`LIMIT`을 추가하세요. `strict` 모드라면 `REDASH_SAFETY_MODE=warn`으로 바꾸면 경고만 표시됩니다 |
| 툴이 보이지 않음 | 설정을 바꾼 뒤 클라이언트를 완전히 재시작하세요 |

## 개발

```bash
npm install
npm run dev     # 소스에서 실행 (tsx)
npm test        # vitest
npm run build   # 타입 검사 + dist/ 번들
```

## Privacy Policy

redash-mcp는 **로컬 MCP 서버**로, 사용자의 Redash 인스턴스와 직접 통신합니다. 중간 서버를 거치지 않습니다.

| 항목 | 설명 |
|------|------|
| **Redash API Key** | 로컬 환경변수(`REDASH_API_KEY`)로만 저장. 외부 전송 없음 |
| **쿼리 내용 및 결과** | MCP 프로토콜을 통해 로컬 MCP 클라이언트에만 전달 |
| **BIRD SQL 설정** | 로컬 파일(`~/.redash-mcp/`)에만 저장. few-shot 예제, 키워드 맵, 피드백 |
| **LLM Fallback** | `ANTHROPIC_API_KEY`를 설정한 경우에만 테이블명 목록을 Anthropic API로 전송. 쿼리 데이터·결과는 전송하지 않음 |

사용자 데이터를 제3자에게 판매하거나 공유하지 않습니다.

**데이터 보존:** 설정 파일은 직접 삭제할 때까지 `~/.redash-mcp/`에 남습니다. 쿼리 캐시는 메모리에만 있고 서버 종료 시 사라지며, 스키마 캐시도 메모리에만 있고 10분 TTL 후 사라집니다.

**연락처:** 문의 및 보안 이슈 보고는 [GitHub Issues](https://github.com/seob717/redash-mcp/issues)로 해 주세요.

## 고지 (Disclaimer)

redash-mcp는 커뮤니티가 만든 비공식 통합 도구이며, **Redash와 제휴·보증·후원 관계가 없습니다**. "Redash"는 해당 상표권자의 상표이며, 여기서는 호환성을 설명하기 위한 용도로만 사용합니다. 이 프로젝트는 Redash의 공개 REST API를 통해서만 통신합니다.

## 라이선스

MIT
