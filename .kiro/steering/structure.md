# Project Structure

## Organization Philosophy

FastAPI によるバックエンド（3層アーキテクチャ）と、Vanilla JavaScript (ES Modules) によるフロントエンド（Feature-first パターン）を組み合わせたハイブリッド構成を採用しています。フレームワークの肥大化を避け、標準Web技術（ES Modules, Tailwind CSS, Native Test Runner）を活かした軽量かつ保守性の高い設計を重視しています。

## Directory Patterns

### Backend Handler Layer (`/routers/`)
**Location**: `routers/`  
**Purpose**: HTTPリクエストの受付、認証依存注入 (`Depends(verify_token)`)、バリデーション、レスポンス返却  
**Rule**: ビジネスロジックや外部API通信を直接書かず、必ず `services/` を呼び出す。

### Backend Service & Logic Layer (`/services/`)
**Location**: `services/`  
**Purpose**: 業務ロジック、データ変換・集計、外部API連携（Gemini, Zaim API, Firebase Auth）の抽象化  
**Rule**:
- **純粋ロジックとI/Oの分離**: 外部API通信を伴うクライアント処理（`*_client.py`）と、データ変換・グルーピング・重複判定などの純粋ロジック（`*_logic.py` または純粋関数）を分離する。
- 純粋ロジックはモック不要で単体テスト可能とし、Webフレームワークやリクエストオブジェクトに依存させない。
- 外部APIエラーは適切な `HTTPException` に変換する。

### Backend Data Access & Schema Layer (`/db.py`, `/schemas.py`)
**Location**: ルート直下 (`db.py`, `schemas.py`)  
**Purpose**: Firestore CRUD、クレデンシャル暗号化/復号 (`db.py`)、および Pydantic v2 データモデル定義 (`schemas.py`)  
**Rule**: 機密情報は必ず暗号化して永続化。スキーマは他レイヤに依存しない独立した定義とする。

### Frontend Feature Modules (`/static/js/features/`)
**Location**: `static/js/features/`  
**Purpose**: 機能ドメインごとのフロントエンド実装（例: `receipt/`, `history/`, `auth.js`, `settings.js`）  
**Rule**:
- 複雑なドメイン機能（`receipt/`, `history/` 等）はディレクトリに分割し、以下の責務分離を徹底する：
  - `logic.js`: **DOM非依存の純粋ロジック**（バリデーション、日付計算、グルーピング、表示判定など）。Node.jsテスト環境とブラウザ環境で完全に共有し、テスト側へのコードのコピペ・重複定義を禁止する。
  - `ui.js`: **DOM描画・イベントハンドリング・見た目の制御**（`document.createElement`, クラスの着脱など）。
  - `queue.js`: 非同期フロー、画像バッチ進行制御、Promise管理。
  - `api.js`: バックエンドAPIとの通信（fetch）。
  - `index.js`: イベントリスナーのバインドとモジュール初期化。
- 単機能や設定系などのコンパクトな機能（`auth.js`, `settings.js` 等）は、過度な分割を避け単一モジュールとして同階層に配置可能とする。

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
2. **UI・I/O と純粋ロジックの分離 (Pure Logic vs Impure I/O & UI)**:
   - **Frontend**: DOM 操作やイベントリスナーは `ui.js` に集約し、純粋なデータ変換・判定・計算は `logic.js` に切り出す。Node.js テスト環境とプロダクションで同一関数を共有し、テスト側へのコード重複（コピペ）を根絶する。
   - **Backend**: ルーター内に複雑なデータ変換・グルーピング・判定をインライン記述せず、`services/*_logic.py` 等の純粋関数に切り出す。これによりモック不要の高速・堅牢なテストを実現する。
3. **CI アライメント**:
   - コード変更時はバックエンド（pytest / ruff）とフロントエンド（単体テスト＋TypeScript型チェック＋Tailwind差分）の双方を検証する。

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
