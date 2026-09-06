# Technology Stack & Verification Standards

## Architecture
FastAPI バックエンド + Jinja2 HTML テンプレート + Vanilla JS (ES Modules) によるハイブリッド構成。

## Core Technologies
- **Backend Language / Runtime**: Python (>= 3.11)
- **Environment Management**: uv (ローカル `.venv` 厳守、pip や venv の直接使用禁止)
- **Web Framework**: FastAPI (>= 0.141.1), Uvicorn (ASGI)
- **Database / BaaS**: Google Cloud Firestore, Firebase Admin SDK
- **Frontend**: Vanilla JavaScript (ES Modules), Tailwind CSS v4
- **Type Checking**: TypeScript (JSDoc-based Type Check via `jsconfig.json`)
- **Testing Frameworks**: pytest, pytest-asyncio (Backend), Node.js native test runner (Frontend)

## Key Libraries & Tools
- **Generative AI**: Google GenAI SDK (`google-genai` >= 2.17.0)
- **OAuth / External API**: `requests-oauthlib` (Zaim API v2 / OAuth 1.0a)
- **Encryption**: `cryptography` (Fernet / AES-128-CBC)
- **Validation**: Pydantic v2 (`pydantic` >= 2.13.4)

## Development Standards & Verification Commands

### 統合検証・CI アライメント規約
実装完了時（`/kiro-impl`）および統合検証時（`/kiro-validate-impl`）は、GitHub Actions CI（`deploy.yml`, `static-analysis.yml`）で実行される以下の全検証をローカルで事前実行し、すべて Green であることを完了（GO）判定の必須ゲートとする。

| カテゴリ | コマンド | 検証内容 | CI ワークフロー |
| :--- | :--- | :--- | :--- |
| **Backend Tests** | `uv run pytest` | API・認証・暗号化・サービステスト | `deploy.yml` |
| **Frontend Tests** | `npm run test` | `tests/*.js` の単体テスト (`node --test`) | `deploy.yml` 前提 |
| **Static Analysis** | `npm run type-check` | TypeScript JSDoc 型チェック (`tsc -p jsconfig.json --noEmit`) | `static-analysis.yml` |
| **Frontend All-in-One** | `npm run check` | フロントエンドの単体テスト＋型チェック直列実行 | - |

## Common Commands

```bash
# Frontend 検証（単体テスト＋TypeScript型チェック）
npm run check

# Frontend 型チェック単体
npm run type-check

# Frontend 単体テスト単体
npm run test

# Backend テスト実行
uv run pytest

# CSS ビルド / ウォッチ
npm run build:css
npm run watch:css

# ライセンス一覧生成 (OSS_LICENSES.txt)
npm run build:licenses

# サーバー起動 (ローカル開発)
uv run uvicorn main:app --reload --port 8000
```
