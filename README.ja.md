# redash-mcp

[![npm version](https://img.shields.io/npm/v/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Downloads](https://img.shields.io/npm/dm/redash-mcp.svg)](https://www.npmjs.com/package/redash-mcp)
[![Node](https://img.shields.io/node/v/redash-mcp.svg)](https://nodejs.org)
[![Glama](https://glama.ai/mcp/servers/seob717/redash-mcp/badges/score.svg)](https://glama.ai/mcp/servers/seob717/redash-mcp)
[![Claude](https://img.shields.io/badge/Claude-Compatible-D97757?logo=claude&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
[![Cursor](https://img.shields.io/badge/Cursor-Compatible-111111)](https://github.com/seob717/redash-mcp#installation)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-Compatible-4285F4?logo=googlegemini&logoColor=white)](https://github.com/seob717/redash-mcp#installation)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-Compatible-412991?logo=openai&logoColor=white)](https://github.com/seob717/redash-mcp#installation)

[English](README.md) | [한국어](README.ko.md) | 日本語

> [Redash](https://redash.io) を Claude・Cursor・Gemini CLI・Codex などあらゆる MCP クライアントに接続する MCP サーバー — 自然言語でデータを照会し、チャートやダッシュボードを作り、SQL を実行します。

[インストール](#インストール) · [ツール](#ツール) · [環境変数](#環境変数) · [使用例](#使用例) · [トラブルシューティング](#トラブルシューティング) · [Privacy](#privacy-policy)

> 英語版 README との最終同期: 2026-10-26

## 3.5 の新機能

- **`create_visualization`** — 保存クエリに折れ線 / 棒 / 面 / 円 / 散布図チャート、またはカウンターを作成します。クエリを実行済みであればカラム名を最新の結果と照合するため、タイプミスは空のチャートではなくエラーになります。
- **ダッシュボードの自動配置** — `add_widget` が新しいウィジェットを既存ウィジェットの下に配置し、半幅ウィジェットは 2 つずつ横に並べます（以前はすべて左上に重なっていました）。

全履歴: [Releases](https://github.com/seob717/redash-mcp/releases)

## なぜ redash-mcp か?

LLM に **本番(production)データ** を安全に扱わせることに重点を置いています:

- **🛡️ SQL セーフティガード** — `DROP`/`TRUNCATE`/`ALTER`、`WHERE` なしの `DELETE`/`UPDATE` をブロック。`strict`/`warn`/`off` モード、PII 検出、自動 `LIMIT` に対応。
- **🧠 BIRD スマートクエリ** — 質問を解析してテーブルを自動選択し、SQL 生成をガイドします（[BIRD text-to-SQL](https://bird-bench.github.io/)）。Claude Haiku フォールバックはオプション。
- **📊 エンドツーエンド** — 照会、保存、チャート、ダッシュボード、アラートまで 25 ツール。
- **⚡ ワンコマンドでセットアップ** — `npx redash-mcp setup` が Claude Desktop / Claude Code / Cursor / Gemini CLI / Codex CLI を設定します。
- **🔒 完全ローカル** — Redash と直接通信し、API キーと結果が端末の外に出ることはありません。

## インストール

**要件:** Node.js 20 以上と Redash API キー（Redash → プロフィール → **Edit Profile** → **API Key**）。

```bash
npx redash-mcp setup
```

ウィザードが Claude Desktop、Claude Code、Cursor、Gemini CLI、Codex CLI の任意の組み合わせを設定します。

Node.js、Claude Desktop、MCP 設定をまとめて行う場合:

```bash
curl -fsSL https://raw.githubusercontent.com/seob717/redash-mcp/main/install.sh | bash
```

<details>
<summary><b>手動セットアップ</b></summary>

- **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor** — `~/.cursor/mcp.json`（なければ作成）

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

## ツール

| カテゴリ | ツール |
|---|---|
| データソース・スキーマ | `list_data_sources`, `list_tables`, `get_table_columns` |
| クエリ実行 | `run_query` — SQL を実行して結果を返す |
| 保存クエリ | `list_queries`, `get_query`, `get_query_result`（パラメータ値を指定可能）, `create_query`, `update_query`, `fork_query`, `archive_query` |
| チャート | `create_visualization` — 折れ線 / 棒 / 面 / 円 / 散布図 / カウンター |
| ダッシュボード | `list_dashboards`, `get_dashboard`, `create_dashboard`, `add_widget`（自動配置） |
| アラート | `list_alerts`, `get_alert`, `create_alert` |
| スマートクエリ（BIRD） | `smart_query`, `get_bird_config`, `evaluate_queries`, `submit_query_feedback`, `manage_few_shot_examples`, `manage_keyword_map` |

### SQL セーフティガード

`run_query` で実行する SQL に適用されます。`get_query_result` で実行する保存クエリはチェックされないため、Redash のデータソースには読み取り専用の DB アカウントを使ってください。

- **常にブロック**（`REDASH_SAFETY_MODE=off` を除く）: `DROP`、`TRUNCATE`、`ALTER TABLE`、`GRANT/REVOKE`、`WHERE` なしの `DELETE/UPDATE`
- **警告（`warn`）/ ブロック（`strict`）**: `SELECT *`、`WHERE`・`LIMIT` のないクエリ、PII カラムへのアクセス
- **自動 LIMIT**: `REDASH_AUTO_LIMIT` 設定時に `LIMIT N` を追加

詳細: [docs/sql-safety-guard.md](docs/sql-safety-guard.md)。クエリ結果はメモリにもキャッシュされます（下記 `REDASH_MCP_CACHE_*` 参照）。

## 環境変数

| 変数 | デフォルト | 説明 |
|---|---|---|
| `REDASH_URL` | **必須** | Redash インスタンスの URL (例: `https://redash.example.com`) |
| `REDASH_API_KEY` | **必須** | Redash ユーザーの API キー |
| `REDASH_SAFETY_MODE` | `warn` | SQL セーフティレベル: `off` / `warn` / `strict` |
| `REDASH_SAFETY_DISABLE_PII` | `false` | PII 検出を無効化 |
| `REDASH_SAFETY_DISABLE_COST` | `false` | コスト警告を無効化 |
| `REDASH_AUTO_LIMIT` | `0` | LIMIT のないクエリに `LIMIT N` を自動追加 (0 = 無効) |
| `REDASH_DEFAULT_MAX_AGE` | `0` | Redash キャッシュ TTL (秒) |
| `REDASH_MCP_CACHE_TTL` | `300` | MCP クエリキャッシュ TTL (秒、0 = 無効) |
| `REDASH_MCP_CACHE_MAX_MB` | `50` | MCP クエリキャッシュの最大メモリ (MB) |
| `REDASH_MCP_CONFIG_DIR` | `~/.redash-mcp` | BIRD few-shot・フィードバック・評価・キーワードマップの保存先 |
| `REDASH_BIRD_ENABLED` | `true` | `false` で BIRD スマートクエリツールを無効化 |
| `REDASH_HTTP_TIMEOUT_SECS` | `30` | Redash API リクエストごとの HTTP タイムアウト |
| `ANTHROPIC_API_KEY` | — | 設定すると `smart_query` のテーブル選択で Claude Haiku フォールバックを使用 |

## 使用例

自然言語で依頼するだけです:

- 「今月の新規登録者数は?」→ `smart_query` がテーブルを選択 → `run_query`
- 「先週の新規登録者のうち、購入した割合は?」→ `smart_query` が JOIN をガイド → `run_query`
- 「日次の新規登録者数が 100 人を下回ったらアラートを作って」→ `create_alert`

**ダッシュボードを作る:** 「月次売上のクエリを保存して折れ線チャートにし、新しい売上ダッシュボードに載せて」

1. `create_query` — 「月次売上」を保存
2. `get_query_result` — 一度実行してチャートのカラムをチェックできるようにする
3. `create_visualization` — `type: "line"`、`x_column: "month"`、`y_columns: ["revenue"]`
4. `create_dashboard` — 「売上」ダッシュボードを作成
5. `add_widget` — チャートを配置。ウィジェットを追加すると下に積まれるか、2 つずつ横に並びます

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `npx` が見つからない（macOS の GUI アプリ） | `which npx` でフルパスを確認し、`command` に指定してください |
| "Authentication failed" | `REDASH_API_KEY` がユーザー API キーか確認してください |
| "Unable to connect to the Redash server" | `REDASH_URL`（`https://` を含み、`/api` は含めない）とネットワーク・VPN を確認してください |
| "The query timed out" | クエリを単純化するか、`run_query` / `get_query_result` に大きめの `timeout_secs` を渡してください。API 応答が遅い場合は `REDASH_HTTP_TIMEOUT_SECS` を増やしてください |
| セーフティガードにブロックされる | `WHERE`/`LIMIT` を追加してください。`strict` モードなら `REDASH_SAFETY_MODE=warn` にすると警告のみになります |
| ツールが表示されない | 設定変更後、クライアントを完全に再起動してください |

## 開発

```bash
npm install
npm run dev     # ソースから実行 (tsx)
npm test        # vitest
npm run build   # 型チェック + dist/ にバンドル
```

## Privacy Policy

redash-mcp は **ローカル MCP サーバー** であり、ユーザーの Redash インスタンスと直接通信します。中間サーバーは介在しません。

| 項目 | 説明 |
|------|------|
| **Redash API Key** | ローカルの環境変数 (`REDASH_API_KEY`) としてのみ保存。外部送信なし。 |
| **クエリ内容と結果** | MCP プロトコルを通じてローカルの MCP クライアントにのみ配信。 |
| **BIRD SQL 設定** | ローカルファイル (`~/.redash-mcp/`) にのみ保存。few-shot 例、キーワードマップ、フィードバック。 |
| **LLM Fallback** | `ANTHROPIC_API_KEY` を設定した場合のみ、`smart_query` がテーブル名・カラム名と質問テキストを Anthropic API に送信。クエリ結果と行データは送信されません。 |

ユーザーデータを第三者に販売・共有することはありません。

**データの保持:** 設定ファイルは削除するまで `~/.redash-mcp/` に残ります。クエリキャッシュはメモリ上のみでサーバー終了時に消去され、スキーマキャッシュもメモリ上のみで 10 分の TTL で失効します。

**連絡先:** お問い合わせ・セキュリティ報告は [GitHub Issues](https://github.com/seob717/redash-mcp/issues) へ。

## 免責事項 (Disclaimer)

redash-mcp はコミュニティが開発した非公式の統合ツールであり、**Redash とは提携・承認・後援のいずれの関係もありません**。「Redash」は各権利者の商標であり、ここでは互換性を説明する目的でのみ使用しています。本プロジェクトは Redash の公開 REST API を通じてのみ通信します。

## ライセンス

MIT
