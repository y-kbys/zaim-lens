# Research & Design Decisions: security-hardening

## Summary
- **Feature**: `security-hardening`
- **Discovery Scope**: Extension / Security Hardening on existing FastAPI & Firebase infrastructure
- **Key Findings**:
  1. **JWT検証バイパス**: `services/auth.py` の `verify_token_manually` 内で、過去のデバッグ時に追加された `verify_aud=False`, `verify_iss=False` のフォールバックが残存しており、Firebase 全体で共通の公開鍵署名を持つ他プロジェクトのトークンを受理してしまう脆弱性となっていた。完全削除によりプロジェクトID厳格検証へ回帰させる。
  2. **過大ペイロード防御**: FastAPI / Pydantic v2 の `Field(..., min_length=..., max_length=...)` を用いることで、コントローラー層に到達する前のリクエストモデル検証段階で 422 Unprocessable Entity として安全に弾くことができる。
  3. **オンデマンドインメモリTTL**: `OAUTH_SECRETS` への TTL 導入は、アクセス時に期限切れトークンを走査・削除するオンデマンド掃除方式により、バックグラウンドスレッドや外部キャッシュサーバーを新規追加することなく、数行の変更でゼロオーバーヘッドに解決可能である。
  4. **Firestore Rules IaC**: GitHub Actions のデプロイパイプライン（Workload Identity 連携済み）に `firebase-tools deploy --only firestore:rules` を追加することで、クライアント直アクセス拒否ルール（`allow read, write: if false;`）を自動的に恒常担保できる。

## Research Log

### Topic: Firebase JWT Token Verification & Cross-Tenant Impersonation
- **Context**: `services/auth.py` の `verify_token_manually` のフォールバック検証がセキュリティリスクとなっていた。
- **Sources Consulted**: Firebase Auth 公式ドキュメント「ID トークンの検証」、PyJWT ドキュメント。
- **Findings**:
  - Google の `securetoken@system.gserviceaccount.com` 公開鍵は全 Firebase プロジェクト共通で使われる。
  - トークンの所属プロジェクトを保証する唯一のクレームは `aud`（プロジェクトID）および `iss`（`https://securetoken.google.com/{project_id}`）である。
  - `options={"verify_aud": False, "verify_iss": False}` を設定すると、攻撃者が任意に設定可能な別プロジェクトの UID で認証を通過させることが可能になる。
- **Implications**: ルーズデコード処理を完全に削除し、プロジェクト ID が一致しないトークンは例外をそのまま送出して 401 Unauthorized とする必要がある。

### Topic: Pydantic v2 Validation for Large Payloads
- **Context**: `/api/parse` および `/api/copy` での DoS / メモリ枯渇リスク。
- **Sources Consulted**: Pydantic v2 ドキュメント（Field constraints）。
- **Findings**:
  - `List[CopyItem] = Field(..., min_length=1, max_length=100)` により、リスト要素数の境界値を宣言的に強制可能。
  - `image_base64: str = Field(..., min_length=1, max_length=14_000_000)` により、約10MB（Base64エンコード後 約13.3MB）を上限として制限可能。
- **Implications**: エンドポイントハンドラ内の追加検証コードなしに、FastAPI のリクエストパース時点で自動的に 422 エラーが返却される。

### Topic: OAuth Secrets Lifecycle & Concurrency
- **Context**: `routers/zaim.py` の `OAUTH_SECRETS` のメモリリーク防止。
- **Findings**:
  - Python の GIL により、単一プロセス内での単純な辞書操作（`pop`, `del`）はアトミックに行われる。
  - リクエスト処理時（`/api/zaim/login`, `/api/zaim/callback`）に `now - created_at > TTL` のキーを抽出して削除するオンデマンド方式で十分機能する。
  - TTL は一般的な OAuth 認証所要時間（1〜2分）に対して余裕を持たせた 10 分（600 秒）が最適。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 宣言的スキーマ制約 + オンデマンドTTL（採用） | Pydantic v2 の `Field` 制約と `OAUTH_SECRETS` へのオンデマンド掃除処理 | 外部依存なし、高速、既存コードの最小変更で安全 | 単一コンテナメモリ内での保持 | 現状の構成と完全合致 |
| 外部ミドルウェア（SlowAPI / Redis） | 全体的なリクエストサイズ制限ミドルウェアおよび Redis キャッシュ | 分散環境での完全共有、細かなレートリミット | インフラコスト増、運用の複雑化 | BYOK 思想および現行規模には過剰 |

## Design Decisions

### Decision: JWT 手動検証におけるルーズデコードの完全撤廃
- **Context**: 他 Firebase プロジェクトのトークンを用いた不正アクセスの防止（Requirement 1）。
- **Selected Approach**: `verify_token_manually` 内の `options={"verify_aud": False, "verify_iss": False}` ブロックを削除。
- **Rationale**: セキュリティの基本原則に立ち返り、自プロジェクトのトークン以外は無条件で 401 拒否する。

### Decision: Pydantic レベルでのデータ長・要素数制約
- **Context**: 過大データによる OOM およびワーカー枯渇の防止（Requirement 2, 3）。
- **Selected Approach**: `CopyRequest` に `min_length=1, max_length=100`、`ParseRequest` に `max_length=14_000_000` を付与。
- **Rationale**: コントローラーやサービス層に負荷をかける前に、フレームワーク境界で遮断する。

### Decision: Firestore ルールの GitHub Actions 自動デプロイ
- **Context**: データベース直接アクセスの恒常的遮断（Requirement 5）。
- **Selected Approach**: リポジトリに `firestore.rules` と `firebase.json` を配置し、`deploy.yml` 内で `npx -y firebase-tools deploy --only firestore:rules` を実行。
- **Rationale**: 手動設定によるオペレーションミスを排除し、ブランチごとのプロジェクト（`prod` / `dev`）に自動適用する。

## Risks & Mitigations
- **リスク 1: ユーザーが 100 件を超える履歴コピーを行いたい場合**:
  - 対策: エラー時に上限 100 件であることを 422 メッセージで明示し、分割コピーを促す。
- **リスク 2: Zaim 認証操作に 10 分以上かかった場合のセッション切れ**:
  - 対策: 10 分は十分長いが、セッション切れ時は安全にエラー画面を表示して再試行を案内する。
