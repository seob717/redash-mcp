# redash-mcp

[![npm version](https://img.shields.io/npm/v/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Downloads](https://img.shields.io/npm/dm/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Node](https://img.shields.io/node/v/redash-mcp.svg)](https://nodejs.org)
[![smithery badge](https://smithery.ai/badge/dev-seob717/redash-mcp)](https://smithery.ai/servers/dev-seob717/redash-mcp)

[English](README.md) | [한국어](README.ko.md) | 日本語

> [Redash](https://redash.io) を Claude AI に接続する MCP サーバー — 自然言語でデータを照会し、SQL を実行し、ダッシュボードを管理します。

[なぜ redash-mcp か](#なぜ-redash-mcp-か) · [機能](#機能) · [インストール](#インストール) · [環境変数](#環境変数) · [使用例](#使用例) · [Privacy](#privacy-policy)

![redash-mcp デモ — Claude が Redash のテーブルを調べ、カテゴリ別売上をチャート化し、SQL セーフティガードが PII エクスポートをブロックする](docs/demo.gif)

> 英語版 README との最終同期: 2026-06-09

---

## なぜ redash-mcp か?

Redash MCP サーバーは複数あります。このサーバーは、LLM に **本番(production)データ** を安全に扱わせることに重点を置いています:

- **🛡️ SQL セーフティガード** — `DROP`/`TRUNCATE`/`ALTER`、`WHERE` なしの `DELETE`/`UPDATE` をブロック。`strict`/`warn`/`off` モード、PII 検出、自動 `LIMIT` まで備え、実際の Redash を安心して Claude に任せられます。
- **🧠 BIRD スマートクエリ** — 質問を解析して適切なテーブルを自動選択し、SQL 生成をガイドします（[BIRD text-to-SQL](https://bird-bench.github.io/) 手法ベース）。テーブル選択用の Claude Haiku フォールバックもオプションで利用できます。
- **⚡ ワンコマンドでセットアップ** — `npx redash-mcp setup` が Claude Desktop / Claude Code の設定を代わりに行います。JSON を手で編集する必要はありません。
- **🔒 完全ローカル** — Redash インスタンスと直接通信し、API キーとクエリ結果が端末から外に出ることはありません。
- **📊 エンドツーエンド** — 照会・保存・複製、ダッシュボード、ウィジェット、アラートまで、6 カテゴリ・20 以上のツール。

---

## 機能

### ツール一覧

| カテゴリ | ツール | 説明 |
|---|---|---|
| データソース | `list_data_sources` | 接続されたデータソースの一覧を取得 |
| スキーマ | `list_tables` | テーブル一覧を取得（キーワード検索対応） |
| スキーマ | `get_table_columns` | テーブルのカラム名と型を取得 |
| スマートクエリ | `smart_query` | 質問を解析 → テーブルを自動選択 → SQL 生成をガイド (BIRD) |
| スマートクエリ | `get_bird_config` | 現在有効な BIRD スマートクエリ設定を取得 |
| スマートクエリ | `evaluate_queries` | 生成された SQL を期待結果と比較評価 |
| スマートクエリ | `submit_query_feedback` | テーブル選択を改善するためのフィードバックを記録 |
| スマートクエリ | `manage_few_shot_examples` | BIRD few-shot 例の追加/一覧 |
| スマートクエリ | `manage_keyword_map` | キーワード→テーブルのマッピングの追加/一覧 |
| クエリ実行 | `run_query` | SQL を実行して結果を返す |
| 保存クエリ | `list_queries` | 保存済みクエリの一覧を取得 |
| 保存クエリ | `get_query` | クエリの詳細（SQL、可視化）を取得 |
| 保存クエリ | `get_query_result` | 保存済みクエリを実行して結果を取得 |
| 保存クエリ | `create_query` | 新しいクエリを保存 |
| 保存クエリ | `update_query` | クエリを更新 |
| 保存クエリ | `fork_query` | クエリを複製 |
| 保存クエリ | `archive_query` | クエリをアーカイブ（削除） |
| ダッシュボード | `list_dashboards` | ダッシュボード一覧を取得 |
| ダッシュボード | `get_dashboard` | ダッシュボードの詳細とウィジェットを取得 |
| ダッシュボード | `create_dashboard` | 新しいダッシュボードを作成 |
| ダッシュボード | `add_widget` | ダッシュボードに可視化ウィジェットを追加 |
| アラート | `list_alerts` | アラート一覧を取得 |
| アラート | `get_alert` | アラートの詳細を取得 |
| アラート | `create_alert` | 新しいアラートを作成 |

### SQL セーフティガード

危険なクエリからデータベースを保護します:

- **常にブロック**: `DROP`、`TRUNCATE`、`ALTER TABLE`、`GRANT/REVOKE`、`WHERE` なしの `DELETE/UPDATE`
- **警告 (warn モード)** / **ブロック (strict モード)**: `SELECT *`、`WHERE` や `LIMIT` のないクエリ、PII カラムへのアクセス
- **自動 LIMIT**: `REDASH_AUTO_LIMIT` 設定時、LIMIT なしのクエリに自動で `LIMIT N` を追加

### クエリキャッシュ

API 呼び出しの重複を減らすため、結果をメモリにキャッシュします:

- TTL: `REDASH_MCP_CACHE_TTL` で設定可能（デフォルト: 300 秒）
- 最大メモリ: `REDASH_MCP_CACHE_MAX_MB` で設定可能（デフォルト: 50MB）

---

## インストール

### 自動セットアップ (推奨)

```bash
npx redash-mcp setup
```

セットアップウィザードが起動し、Claude Desktop、Claude Code (CLI)、またはその両方を設定できます。

### シェルスクリプトでインストール

Node.js、Claude Desktop、MCP 設定を一括で行います:

```bash
curl -fsSL https://raw.githubusercontent.com/seob717/redash-mcp/main/install.sh | bash
```

### 手動セットアップ

#### 1. Redash API キーを取得

Redash → 右上のプロフィール → **Edit Profile** → **API Key** をコピー

#### 2-A. Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` を開き、以下を追加します:

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

保存後、Claude Desktop を完全に終了してから再起動してください。

#### 2-B. Claude Code (CLI)

`~/.claude/settings.json` を開き、以下を追加します:

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

> **macOS**: `npx` が見つからない場合は `which npx` でフルパスを確認して置き換えてください。

---

## 環境変数

### 必須

| 変数 | 説明 |
|---|---|
| `REDASH_URL` | Redash インスタンスの URL (例: `https://redash.example.com`) |
| `REDASH_API_KEY` | Redash ユーザーの API キー |

### オプション

| 変数 | デフォルト | 説明 |
|---|---|---|
| `REDASH_SAFETY_MODE` | `warn` | SQL セーフティレベル: `off` / `warn` / `strict` |
| `REDASH_SAFETY_DISABLE_PII` | `false` | PII 検出を無効化 |
| `REDASH_SAFETY_DISABLE_COST` | `false` | コスト警告を無効化 |
| `REDASH_AUTO_LIMIT` | `0` | LIMIT のないクエリに自動で `LIMIT N` を追加 (0 = 無効) |
| `REDASH_DEFAULT_MAX_AGE` | `0` | Redash キャッシュ TTL (秒) |
| `REDASH_MCP_CACHE_TTL` | `300` | MCP クエリキャッシュ TTL (秒、0 = 無効) |
| `REDASH_MCP_CACHE_MAX_MB` | `50` | MCP クエリキャッシュの最大メモリ (MB) |
| `REDASH_MCP_CONFIG_DIR` | `~/.redash-mcp` | BIRD few-shot、フィードバック、評価、キーワードマップの保存ディレクトリ |
| `REDASH_BIRD_ENABLED` | `true` | `false` に設定すると BIRD smart query ツールを無効化 |
| `REDASH_HTTP_TIMEOUT_SECS` | `30` | Redash API リクエストごとの HTTP タイムアウト |
| `ANTHROPIC_API_KEY` | — | 設定時、BIRD smart_query がキーワードスコアリング失敗時に Claude Haiku でテーブル選択にフォールバック |

---

## 使用例

Claude に自然言語で依頼するだけです:

- 「users テーブルのカラムを見せて」
- 「直近 7 日の注文数を SQL で調べて」
- 「保存済みクエリの一覧を見せて」
- 「売上ダッシュボードのウィジェット一覧を教えて」
- 「日次の新規登録者数が 100 人を下回ったらアラートを作って」

### 例 1: 自然言語でデータを照会

> **プロンプト**: 「今月の新規登録者数は?」

**ツールフロー:**
1. `list_data_sources` → 対象のデータソースを特定
2. `smart_query` → 質問を解析し、`User` テーブルを自動選択、SQL 生成のガイドを提示
3. `run_query` → 生成された SQL を実行

**結果:**
```
今月の新規登録者は 18,197 人です。
```

### 例 2: 複雑なビジネス質問

> **プロンプト**: 「先週の新規登録者のうち、購入した割合は?」

**ツールフロー:**
1. `smart_query` → 質問を解析し、`User`・`Payment` テーブルを自動選択、JOIN クエリのガイドを提示
2. `run_query` → SQL を実行

**結果:**
```
先週の新規登録者 1,204 人のうち、312 人が購入しました (25.9%)。
```

### 例 3: クエリ保存とダッシュボード作成

> **プロンプト**: 「月次売上推移のクエリを作ってダッシュボードに追加して」

**ツールフロー:**
1. `smart_query` → 売上関連のテーブルを解析
2. `create_query` → 「月次売上推移」クエリを保存
3. `create_dashboard` → 「売上ダッシュボード」を作成
4. `get_query` → 保存したクエリの可視化 ID を取得
5. `add_widget` → ダッシュボードにチャートウィジェットを追加

**結果:**
```
「売上ダッシュボード」を作成し、月次売上推移チャートを追加しました。
Redash で確認: https://your-redash.com/dashboard/monthly-revenue
```

---

## Privacy Policy

### データの収集と処理

redash-mcp は **ローカル MCP サーバー** であり、ユーザーの Redash インスタンスと直接通信します。中間サーバーは介在しません。

| 項目 | 説明 |
|------|------|
| **Redash API Key** | ローカルの環境変数 (`REDASH_API_KEY`) としてのみ保存。外部送信なし。 |
| **クエリ内容と結果** | MCP プロトコルを通じてローカルクライアント (Claude Desktop/Code) にのみ配信。 |
| **BIRD SQL 設定** | ローカルファイル (`~/.redash-mcp/`) にのみ保存。few-shot 例、キーワードマップ、フィードバックを含む。 |
| **LLM Fallback** | `ANTHROPIC_API_KEY` 設定時、テーブル名のリストのみ Anthropic API に送信。クエリデータと結果は送信されません。 |

### 第三者との共有

ユーザーデータを第三者に販売・共有することはありません。LLM Fallback 機能が有効な場合のみ、テーブル名のリストが Anthropic API に送信されます。これはユーザーが明示的に `ANTHROPIC_API_KEY` を設定した場合に限ります。

### データの保持

- **設定ファイル**: `~/.redash-mcp/` にローカル保存 (ユーザーがいつでも削除可能)
- **クエリキャッシュ**: メモリ上のみ、サーバー終了時に消去
- **スキーマキャッシュ**: メモリ上のみ、10 分の TTL で自動失効

### 連絡先

お問い合わせ・セキュリティ報告: [GitHub Issues](https://github.com/seob717/redash-mcp/issues)
