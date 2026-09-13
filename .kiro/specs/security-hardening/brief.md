# Brief: security-hardening

## Problem
システムのセキュリティ診断において、以下の重大な脆弱性およびリソース枯渇・安定性リスクが特定された。
1. Firebase JWT トークン手動検証処理におけるフォールバック（`verify_aud=False`, `verify_iss=False`）により、同一の公開鍵署名を持つ別 Firebase プロジェクトのトークンを用いた任意の UID なりすまし（テナント分離崩壊）が可能になっている。
2. `/api/parse`（画像 Base64）および `/api/copy`（コピー品目リスト）にサイズ・件数の上限バリデーションがなく、悪意のあるリクエストや過大データによってサーバーの OOM（メモリ枯渇）やワーカーの長時間占有（スレッド枯渇・タイムアウト）が引き起こされる。
3. OAuth 認証時の一時セッション辞書 `OAUTH_SECRETS` に TTL（有効期限）がなく、未完了・離脱セッションのデータがサーバーメモリ上に永久に残り続ける。
4. Firestore のクライアント直アクセス遮断ルール（`allow read, write: if false;`）がコード管理・自動デプロイされておらず、手動設定に依存している。

## Current State
- `services/auth.py`: `verify_token_manually` 内で例外発生時に `verify_aud=False`, `verify_iss=False` でデコードする処理が残存している。
- `schemas.py`: `ParseRequest.image_base64` および `CopyRequest.items_to_copy` に文字長・要素数の上限チェックがない。
- `routers/zaim.py`: `OAUTH_SECRETS` は単なるグローバル辞書であり、エントリの自動破棄機能がない。
- インフラ: `firestore.rules` および `firebase.json` がリポジトリに存在せず、GitHub Actions のデプロイパイプラインにセキュリティルール適用のステップがない。

## Desired Outcome
1. **厳格な認証検証**: 自プロジェクト（`FIREBASE_PROJECT_ID`）向けの正規トークンのみを受理し、不正または別プロジェクトのトークンは確実に 401 拒否されること。
2. **過大ペイロード防御**: 履歴コピーは最大 100 件、画像 Base64 は 10MB 相当（約 14MB の文字長）を超えた場合に 422 Unprocessable Entity で即座に弾かれること。
3. **メモリリーク解消**: `OAUTH_SECRETS` に登録された一時データは有効期限（例: 10分）を過ぎると自動的に破棄され、未完了セッションによるメモリ肥大化を防止すること。
4. **セキュリティルール IaC 化**: リポジトリに `firestore.rules` を定義し、GitHub Actions デプロイ時に自動適用され、クライアントからの直接アクセスが全遮断されること。
5. **回帰防止**: 既存のテストがすべて通過し、上記セキュリティ制約を検証する自動テストが整備されていること。

## Approach
- **認証層**: `services/auth.py` から `verify_aud: False`, `verify_iss: False` によるフォールバックを完全撤廃し、厳格な署名・発行者・対象者検証のみを許可する。
- **スキーマ層**: Pydantic v2 の `Field(..., max_length=...)` を用いて、リクエスト受信時点で過大データを拒否する。
- **OAuth セッション管理**: `routers/zaim.py` 内でエントリに登録時刻を付与し、アクセス時または定期的に古いエントリを一括クリーンアップする軽量な TTL 機構を実装する。
- **CI/CD インフラ**: `firestore.rules`（全拒否設定）と `firebase.json` を配置し、既存の GitHub Actions ワークフロー（`deploy.yml`）に `firebase-tools` によるルールデプロイステップを追加する。

## Scope
- **In**:
  - `services/auth.py` の JWT 手動検証ロジックの修正（ルーズ検証の完全削除）
  - `schemas.py` の `ParseRequest`（画像 Base64 長上限）および `CopyRequest`（アイテム数 100 件上限）のバリデーション追加
  - `routers/zaim.py` の `OAUTH_SECRETS` に対する TTL 期限切れクリーンアップ処理の追加
  - `firestore.rules`, `firebase.json` の作成
  - `.github/workflows/deploy.yml` への Firestore ルールデプロイ追加
  - バックエンドの単体テスト（`tests/`）の追加・更新
- **Out**:
  - フロントエンド UI の大規模な変更（既存の UI 仕様を維持）
  - 外部 API（Gemini / Zaim）の利用制限・レートリミット導入（BYOK 思想に基づきユーザー自己責任とする）
  - Firestore 以外の外部キャッシュ（Redis 等）の新規導入（インメモリ TTL で十分対応可能）

## Boundary Candidates
- **認証境界 (`services/auth.py`)**: トークン検証と UID 解決のセキュリティ保証。
- **リクエスト検証境界 (`schemas.py`)**: 入力データのサイズ・件数バリデーション。
- **セッション境界 (`routers/zaim.py`)**: OAuth 一時シークレットのライフサイクル管理。
- **インフラデプロイ境界 (`firestore.rules`, `deploy.yml`)**: Firestore のアクセス制御ポリシー定義と CI/CD 自動適用。

## Out of Boundary
- Gemini API / Zaim API 自体のレートリミット制御
- ユーザーデータのエクスポート・バックアップ機能

## Upstream / Downstream
- **Upstream**: Firebase Authentication (公開鍵配信, IDトークン), Google Cloud Firestore
- **Downstream**: `/api/parse`, `/api/copy`, `/api/zaim/login`, `/api/zaim/callback`

## Existing Spec Touchpoints
- **Extends**:
  - `gemini-api-backend` (画像解析エンドポイントの入力保護)
  - `zaim-integration` (OAuth セッション管理および認証連携)
  - `history-copy-ui` (履歴コピー API のアイテム数制限)
- **Adjacent**: なし

## Constraints
- Python 3.11+ / Pydantic v2
- 環境管理は `uv` を使用（直接 pip / venv 禁止）
- CI 検証（`uv run pytest`, `npm run check`）のオールグリーン厳守
