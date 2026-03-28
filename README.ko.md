# redash-mcp

[Redash](https://redash.io)를 Claude AI에 연결하는 MCP 서버 — 자연어로 데이터를 조회하고 대시보드를 관리하세요.

**[English Documentation](README.md)**

---

## 기능

### 툴 목록

| 카테고리 | 툴 | 설명 |
|---|---|---|
| 데이터소스 | `list_data_sources` | 연결된 데이터소스 목록 조회 |
| 스키마 | `list_tables` | 테이블 목록 조회 (키워드 검색 가능) |
| 스키마 | `get_table_columns` | 테이블 컬럼명 및 타입 조회 |
| 쿼리 실행 | `run_query` | SQL 직접 실행 후 결과 반환 |
| 저장 쿼리 | `list_queries` | 저장된 쿼리 목록 조회 |
| 저장 쿼리 | `get_query` | 쿼리 상세 정보 (SQL, 시각화 등) 조회 |
| 저장 쿼리 | `get_query_result` | 저장된 쿼리 실행 결과 조회 |
| 저장 쿼리 | `create_query` | 새 쿼리 저장 |
| 저장 쿼리 | `update_query` | 쿼리 수정 |
| 저장 쿼리 | `fork_query` | 쿼리 복제 |
| 저장 쿼리 | `archive_query` | 쿼리 삭제 (아카이브) |
| 대시보드 | `list_dashboards` | 대시보드 목록 조회 |
| 대시보드 | `get_dashboard` | 대시보드 상세 및 위젯 목록 조회 |
| 대시보드 | `create_dashboard` | 새 대시보드 생성 |
| 대시보드 | `add_widget` | 대시보드에 시각화 위젯 추가 |
| 알림 | `list_alerts` | 알림 목록 조회 |
| 알림 | `get_alert` | 알림 상세 정보 조회 |
| 알림 | `create_alert` | 새 알림 생성 |

### SQL 안전 가드

위험한 쿼리로부터 데이터베이스를 보호합니다:

- **항상 차단**: `DROP`, `TRUNCATE`, `ALTER TABLE`, `GRANT/REVOKE`, `WHERE` 없는 `DELETE/UPDATE`
- **경고 (warn 모드)** / **차단 (strict 모드)**: `SELECT *`, `WHERE`·`LIMIT` 없는 쿼리, PII 컬럼 접근
- **자동 LIMIT**: `REDASH_AUTO_LIMIT` 설정 시 LIMIT 없는 쿼리에 자동으로 `LIMIT N` 추가

### 쿼리 캐시

중복 API 호출을 줄이기 위해 결과를 메모리에 캐싱합니다:

- TTL: `REDASH_MCP_CACHE_TTL` 환경변수로 설정 (기본값: 300초)
- 최대 메모리: `REDASH_MCP_CACHE_MAX_MB` 환경변수로 설정 (기본값: 50MB)

---

## 설치

### 자동 설치 (권장)

```bash
npx redash-mcp setup
```

설치 마법사가 실행되며 Claude Desktop, Claude Code(CLI), 또는 둘 다 선택하여 설정할 수 있습니다.

### 셸 스크립트로 설치

Node.js, Claude Desktop, MCP 설정을 한번에 처리합니다:

```bash
curl -fsSL https://raw.githubusercontent.com/seob717/redash-mcp/main/install.sh | bash
```

### 수동 설치

#### 1. Redash API 키 발급

Redash → 우측 상단 프로필 → **Edit Profile** → **API Key** 복사

#### 2-A. Claude Desktop 설정

`~/Library/Application Support/Claude/claude_desktop_config.json` 파일을 열고 아래 내용을 추가합니다:

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

#### 2-B. Claude Code (CLI) 설정

`~/.claude/settings.json` 파일을 열고 아래 내용을 추가합니다:

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

> **macOS**: `npx`를 못 찾는 경우 `which npx` 명령어로 전체 경로를 확인 후 대체하세요.

---

## 환경 변수

### 필수

| 변수 | 설명 |
|---|---|
| `REDASH_URL` | Redash 인스턴스 URL (예: `https://redash.example.com`) |
| `REDASH_API_KEY` | Redash 사용자 API 키 |

### 선택

| 변수 | 기본값 | 설명 |
|---|---|---|
| `REDASH_SAFETY_MODE` | `warn` | SQL 안전 수준: `off` / `warn` / `strict` |
| `REDASH_SAFETY_DISABLE_PII` | `false` | PII 감지 비활성화 |
| `REDASH_SAFETY_DISABLE_COST` | `false` | 비용 경고 비활성화 |
| `REDASH_AUTO_LIMIT` | `0` | LIMIT 없는 쿼리에 자동으로 `LIMIT N` 추가 (0 = 비활성화) |
| `REDASH_DEFAULT_MAX_AGE` | `0` | Redash 캐시 TTL (초) |
| `REDASH_MCP_CACHE_TTL` | `300` | MCP 쿼리 캐시 TTL (초, 0 = 비활성화) |
| `REDASH_MCP_CACHE_MAX_MB` | `50` | MCP 쿼리 캐시 최대 메모리 (MB) |

---

## 사용 예시

Claude에게 자연어로 요청하면 됩니다:

- "users 테이블 컬럼 보여줘"
- "최근 7일 주문 수를 SQL로 조회해줘"
- "저장된 쿼리 목록 보여줘"
- "매출 대시보드 위젯 목록 알려줘"
- "일별 가입자 수가 100명 이하로 떨어지면 알림 만들어줘"

### 예제 1: 자연어로 데이터 조회

> **프롬프트**: "이번 달 신규 가입자 수 알려줘"

**실행 흐름:**
1. `list_data_sources` → 데이터소스 목록 확인
2. `smart_query` → 질문 분석, 관련 테이블(`User`) 자동 선택, SQL 생성 가이드 제공
3. `run_query` → 생성된 SQL 실행

**결과:**
```
이번 달 신규 가입자는 18,197명입니다.
```

### 예제 2: 복잡한 비즈니스 질문

> **프롬프트**: "지난주 신규 가입자 중 결제한 사용자 비율은?"

**실행 흐름:**
1. `smart_query` → 질문 분석, `User`·`Payment` 테이블 자동 선택, JOIN 쿼리 가이드 제공
2. `run_query` → SQL 실행

**결과:**
```
지난주 신규 가입자 1,204명 중 결제한 사용자는 312명 (25.9%)입니다.
```

### 예제 3: 쿼리 저장 + 대시보드 생성

> **프롬프트**: "월별 매출 추이 쿼리를 만들고 대시보드에 추가해줘"

**실행 흐름:**
1. `smart_query` → 매출 관련 테이블 분석
2. `create_query` → "월별 매출 추이" 쿼리 저장
3. `create_dashboard` → "매출 대시보드" 생성
4. `get_query` → 저장된 쿼리의 시각화 ID 확인
5. `add_widget` → 대시보드에 차트 위젯 추가

**결과:**
```
"매출 대시보드"가 생성되었고, 월별 매출 추이 차트가 추가되었습니다.
Redash에서 확인: https://your-redash.com/dashboard/monthly-revenue
```

---

## Privacy Policy

### 데이터 수집 및 처리

redash-mcp는 **로컬 MCP 서버**로, 사용자의 Redash 인스턴스와 직접 통신합니다. 중간 서버를 거치지 않습니다.

| 항목 | 설명 |
|------|------|
| **Redash API Key** | 로컬 환경변수(`REDASH_API_KEY`)로만 저장. 외부 전송 없음 |
| **쿼리 내용 및 결과** | MCP 프로토콜을 통해 로컬 클라이언트(Claude Desktop/Code)에만 전달 |
| **BIRD SQL 설정** | 로컬 파일(`~/.redash-mcp/`)에만 저장. Few-shot 예제, 키워드 맵, 피드백 등 |
| **LLM Fallback** | `ANTHROPIC_API_KEY` 설정 시, 테이블명 목록만 Anthropic API로 전송. 쿼리 데이터·결과는 전송하지 않음 |

### 제3자 공유

사용자 데이터를 제3자에게 판매하거나 공유하지 않습니다. LLM Fallback 기능 사용 시 Anthropic API로 테이블명 목록만 전송되며, 이는 사용자가 `ANTHROPIC_API_KEY`를 설정한 경우에만 활성화됩니다.

### 데이터 보존

- 설정 파일: `~/.redash-mcp/` 디렉토리에 로컬 저장 (사용자가 직접 삭제 가능)
- 쿼리 캐시: 메모리에만 저장, 서버 종료 시 소멸
- 스키마 캐시: 메모리에만 저장, 10분 TTL 후 자동 소멸

### 연락처

문의 및 보안 이슈 보고: [GitHub Issues](https://github.com/seob717/redash-mcp/issues)
