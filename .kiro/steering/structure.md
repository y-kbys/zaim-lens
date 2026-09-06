# Project Structure

## Organization Philosophy

FastAPI によるバックエンド（3層アーキテクチャ）と、Vanilla JavaScript (ES Modules) によるフロントエンド（Feature-first パターン）を組み合わせたハイブリッド構成を採用しています。フレームワークの肥大化を避け、標準Web技術（ES Modules, Tailwind CSS, Native Test Runner）を活かした軽量かつ保守性の高い設計を重視しています。

## Directory Patterns

### Backend Handler Layer (`/routers/`)
**Location**: `routers/`  
**Purpose**: HTTPリクエストの受付、認証依存注入 (`Depends(verify_token)`)、バリデーション、レスポンス返却  
**Rule**: ビジネスロジックや外部API通信を直接書かず、必ず `services/` を呼び出す。

### Backend Service / Client Layer (`/services/`)
**Location**: `services/`  
**Purpose**: 業務ロジック、外部API連携（Gemini, Zaim API, Firebase Auth）の抽象化  
**Rule**: リクエストオブジェクトに依存しない純粋な関数・クラスとして設計し、外部エラーは適切な `HTTPException` に変換する。

### Backend Data Access & Schema Layer (`/db.py`, `/schemas.py`)
**Location**: ルート直下 (`db.py`, `schemas.py`)  
**Purpose**: Firestore CRUD、クレデンシャル暗号化/復号 (`db.py`)、および Pydantic v2 データモデル定義 (`schemas.py`)  
**Rule**: 機密情報は必ず暗号化して永続化。スキーマは他レイヤに依存しない独立した定義とする。

### Frontend Feature Modules (`/static/js/features/`)
**Location**: `static/js/features/`  
**Purpose**: 機能ドメインごとのフロントエンド実装（例: `receipt/`, `history/`）  
**Rule**: Feature ごとに `ui.js` (DOM描画・イベント), `logic.js` or `queue.js` (状態・ロジック), `api.js` (バックエンド通信), `index.js` (初期化) に責務を分離する。

### Frontend Shared & Infrastructure (`/static/js/api/`, `/static/js/utils/`, `/static/js/state.js`)
**Location**: `static/js/`  
**Purpose**: 全画面共通の API クライアント、DOM ユーティリティ、グローバルステート管理 (`state.js`)  
**Rule**: 循環参照を避け、下位モジュール（utils, api）は上位モジュール（features）に依存しない。

### Presentation Templates (`/templates/`, `/static/`)
**Location**: `templates/`, `static/`  
**Purpose**: Jinja2 HTML テンプレート（App Shell）、Tailwind CSS ソース (`input.css`)、PWA マニフェストなど

### Test Suite (`/tests/`)
**Location**: `tests/`  
**Purpose**: pytest (Python バックエンドテスト) と Node.js テストランナー (JS フロントエンドテスト) の集約配置  
**Rule**: バックエンドは `test_*.py`、フロントエンドは `test_*.js` の命名で同居。

## Naming Conventions

- **Python Files & Functions**: `snake_case` (例: `zaim_service.py`, `get_user_settings()`)
- **Python Classes & Schemas**: `PascalCase` (例: `ZaimClient`, `ReceiptParseRequest`)
- **JavaScript Files**: `kebab-case` または `camelCase` (例: `queue.js`, `backend.js`)
- **JavaScript Functions & Variables**: `camelCase` (例: `renderQueueItem()`, `activeAccountId`)
- **CSS Classes**: Tailwind CSS v4 ユーティリティクラス優先、カスタムスタイルは `input.css` に定義

## Import Organization

### Python (Backend)
```python
# 1. Standard Library
import os
from datetime import datetime

# 2. Third-Party Packages
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

# 3. Local Application Modules
from db import get_db, encrypt_value
from schemas import ReceiptResponse
from services.gemini import parse_receipt
```

### JavaScript (Frontend)
ES Modules を使用し、ルート相対パス `/static/js/...` または相対パス `./...` で統一。
```javascript
// 1. Shared / Utils / State
import { state } from '/static/js/state.js';
import { showToast } from '/static/js/utils/dom.js';

// 2. Feature Internal Modules
import { updateQueueUI } from './ui.js';
import { executeReceiptBatch } from './queue.js';
```

## Code Organization Principles

1. **厳格なレイヤ間依存の一方向性**:
   - Backend: `routers` → `services` → (`db`, `schemas`)
   - Frontend: `main.js` → `features/*` → (`api`, `utils`, `state`)
2. **UI とロジックの分離 (Separation of Concerns)**:
   - DOM 操作やイベントリスナーは `ui.js` に集約し、純粋なデータ変換やキューイングロジックは `logic.js` / `queue.js` に切り出して Node.js 環境で単体テスト可能にする。
3. **CI アライメント**:
   - コード変更時はバックエンド（pytest）とフロントエンド（単体テスト＋TypeScript型チェック）の双方を検証する。

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
