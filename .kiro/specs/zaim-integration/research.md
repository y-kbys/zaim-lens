# Implementation Gap Analysis: Zaim Integration (`zaim-integration`)

## 1. 調査概要と現状資産の分析 (Current State Investigation)

### 対象機能
Zaim OAuth 1.0a 認証連携、マルチアカウント管理、マスタデータ取得、支出登録・重複検知、および履歴取得・コピー機能。

### 既存の関連モジュール
| レイヤ / モジュール | 主な役割・実装内容 | 既存の健全度・状況 |
| :--- | :--- | :--- |
| **Router (`routers/zaim.py`)** | OAuth 認証フロー (`/api/zaim/login`, `/callback`)、アカウント管理、マスタ取得、支出登録 (`/api/register`)、履歴コピー (`/api/copy`) | 主要エンドポイントは概ね実装済みだが、クレデンシャル返却時のマスキング不足や一部エラーハンドリングの不整合あり |
| **Client Service (`services/zaim_client.py`)** | Zaim OAuth 1.0a 通信 (`requests-oauthlib`)、カテゴリ/ジャンル取得、口座一覧取得、重複チェック、支出登録 | 基本通信は稼働中。個別アカウントの Consumer Key/Secret 優先ロジックの補強が必要 |
| **Business Service (`services/zaim_service.py`)** | 支出品目の整形、マイナス値引き（ポイント）、レシートIDグループ化登録 | 実装済み |
| **Master Data (`services/master_data_service.py`)** | Zaim API ダイレクト取得ラッパー | 実装済み |
| **Data Access (`db.py`)** | `accounts` 辞書の Fernet 暗号化保存・復号 | 暗号化対応済み |
| **Schemas (`schemas.py`)** | `RegisterRequest`, `CopyRequest`, `ZaimCredentialsRequest` 等の Pydantic モデル | 定義済み |
| **Test Suite (`tests/`)** | テストファイル群 | **Zaim 関連の自動テスト（OAuth, 支出登録, 重複検知, コピー）が存在しない（Gap）** |

---

## 2. 要件と既存実装のギャップ分析 (Requirements Feasibility & Gap)

| 要件 (Requirement) | 既存実装状況 | ギャップ / 制約 (Gap & Constraints) |
| :--- | :--- | :--- |
| **Req 1: OAuth 1.0a 認証連携** | 実装済み (`/api/zaim/login`, `/callback`) | **Constraint**: SPA/Cookie制約対策の `OAUTH_SECRETS` インメモリ管理。<br>**Gap**: コールバック時のエラーハンドリングの統一と自動テストの欠如。 |
| **Req 2: マルチアカウント管理** | 実装済み (`/api/zaim/status`, `/credentials`) | **Gap (セキュリティ)**: `GET /api/zaim/credentials/{account_id}` で平文トークン・シークレットを返却しており、アーキテクチャ規約4.4（マスキング必須）に違反。<br>**Gap**: 個別 Consumer Key/Secret 保存時の優先利用。 |
| **Req 3: マスタデータ取得** | 実装済み (`/api/zaim/categories`, `/api/zaim/accounts`) | カテゴリ・ジャンルおよび有効口座 (`active != -1`) フィルタリング済み。 |
| **Req 4: 支出登録と重複検知** | 実装済み (`/api/register`) | 重複検知 (`check_zaim_duplicate`)、ポイント利用（マイナス金額）対応済み。 |
| **Req 5: 履歴取得とコピー** | 実装済み (`/api/history`, `/api/copy`) | レシートグループ単位での同一レシートID生成、重複検知、順序維持対応済み。 |

---

## 3. 実装・改修アプローチの比較評価 (Implementation Approaches)

### Option A: 既存モジュールの堅牢化とリファクタリング（推奨）
- **方針**: 既存の `routers/zaim.py` と `services/zaim_client.py` を維持しつつ、アーキテクチャ規約に準拠したマスキング修正、個別クレデンシャル優先処理、および包括的な pytest モックテストスイートを追加する。
- **メリット**:
  - 既存フロントエンドとのインターフェース破壊を防止。
  - 最小限の変更でセキュリティと信頼性を大幅に向上。
- **デメリット**:
  - `routers/zaim.py` が約440行とやや大きめ。

### Option B: ドメイン別サブルーターへの分割
- **方針**: `routers/zaim_auth.py`, `routers/zaim_accounts.py`, `routers/zaim_transactions.py` 等に分割。
- **メリット**: 単一責任原則の徹底、ファイルの見通し向上。
- **デメリット**: ファイル数が増加し、ルーティング設定やテストの分割工数が増大。

### Option C: ハイブリッドアプローチ（段階的移行）
- **方針**: まずセキュリティ不整合修正（マスキング）とテスト作成を完了させ、必要に応じて後続フェーズでファイル分割を行う。

---

## 4. 複雑度・リスク評価 (Complexity & Risk)

- **開発規模 (Effort)**: **M (3〜5日相当)**
  - 既存コードが既にベース機能を提供しているため、主たる作業はセキュリティ規約準拠（マスキング）、エッジケース処理、および完全なテストスイートの構築。
- **リスク (Risk)**: **Low**
  - OAuth 1.0a 通信および Zaim API のデータ構造は実証済みであり、未知の技術スタックは存在しない。

---

## 5. 設計フェーズへの推奨事項と研究項目 (Recommendations & Research)

1. **クレデンシャル返却 API のマスキング仕様統一**:
   - `GET /api/zaim/credentials/{account_id}` において、`consumer_key` / `token` 等を `is_configured: bool` および `token_last_4: str` に統一するか、フォーム編集用の適切な設計を確定する。
2. **個別 Consumer Key/Secret 優先ロジック**:
   - ユーザー設定に個別 `consumer_key`/`consumer_secret` がある場合、システム共通の環境変数より優先して `OAuth1Session` を生成する。
3. **Zaim API モックテストの設計**:
   - `responses` または `unittest.mock` を用いて、OAuth フロー、支出登録、重複警告、履歴コピーを CI 上で 100% 自動テスト可能な構造にする。
