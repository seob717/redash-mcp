# redash-mcp

[Redash](https://redash.io)를 Claude AI에서 직접 조회하고 관리할 수 있는 MCP(Model Context Protocol) 서버입니다.

## 기능

| 카테고리 | 툴 | 설명 |
|---|---|---|
| 데이터소스 | `list_data_sources` | 연결된 데이터소스 목록 조회 |
| 스키마 | `list_tables` | 테이블 목록 조회 (키워드 검색 가능) |
| 스키마 | `get_table_columns` | 테이블 컬럼명/타입 조회 |
| 쿼리 실행 | `run_query` | SQL 직접 실행 후 결과 반환 |
| 저장 쿼리 | `list_queries` | 저장된 쿼리 목록 조회 |
| 저장 쿼리 | `get_query` | 쿼리 상세 정보(SQL, 시각화 등) 조회 |
| 저장 쿼리 | `get_query_result` | 저장된 쿼리 실행 결과 조회 |
| 저장 쿼리 | `create_query` | 새 쿼리 저장 |
| 저장 쿼리 | `update_query` | 쿼리 수정 |
| 저장 쿼리 | `fork_query` | 쿼리 복제 |
| 저장 쿼리 | `archive_query` | 쿼리 삭제 |
| 대시보드 | `list_dashboards` | 대시보드 목록 조회 |
| 대시보드 | `get_dashboard` | 대시보드 상세 및 위젯 목록 조회 |
| 대시보드 | `create_dashboard` | 새 대시보드 생성 |
| 대시보드 | `add_widget` | 대시보드에 시각화 위젯 추가 |
| 알림 | `list_alerts` | 알림 목록 조회 |
| 알림 | `get_alert` | 알림 상세 정보 조회 |
| 알림 | `create_alert` | 새 알림 생성 |

## 설치 (Claude Desktop)

### 1. Redash API 키 발급

Redash → 우측 상단 프로필 → **Edit Profile** → **API Key** 복사

### 2. Claude Desktop 설정

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

> **Windows/Linux**: `command`를 `npx`로 그대로 사용하면 됩니다.
> **macOS**: `npx`를 못 찾는 경우 `which npx` 명령어로 전체 경로를 확인 후 대체하세요.

### 3. Claude Desktop 재시작

설정 저장 후 Claude Desktop을 완전히 종료했다가 다시 시작합니다.

## 환경 변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `REDASH_URL` | ✅ | Redash 인스턴스 URL (예: `https://redash.example.com`) |
| `REDASH_API_KEY` | ✅ | Redash 사용자 API 키 |

## 사용 예시

Claude에게 자연어로 요청하면 됩니다:

- "Redash에서 users 테이블 컬럼 보여줘"
- "최근 7일 주문 수를 SQL로 조회해줘"
- "저장된 쿼리 목록 보여줘"
- "매출 대시보드 위젯 목록 알려줘"
