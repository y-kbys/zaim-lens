# Implementation Gap Analysis: gemini-api-backend

## 1. Executive Summary
本仕様（`gemini-api-backend`）は、既存の Gemini API 連携バックエンド実装（FastAPI エンドポイント、Google GenAI SDK 連携、APIキー暗号化管理、モデルフォールバックチェーン、エラーハンドリング）の仕様化です。
コードベース調査の結果、**定義された全要件（Requirement 1〜4）は現在の実装において 100% 網羅・実装済み**であり、重大な機能ギャップや未実装部分は存在しません。

---

## 2. Requirement-to-Asset Mapping

| 要件 (Requirement) | 該当コード / モジュール | 実装状況 | 備考・制約 |
| :--- | :--- | :---: | :--- |
| **Requirement 1: 認証情報管理**<br>- 暗号化保存<br>- マスク表示取得<br>- 削除<br>- 環境変数フォールバック | - [`routers/gemini.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/routers/gemini.py)<br>- [`db.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/db.py)<br>- [`schemas.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/schemas.py) | **Implemented** | Fernet 暗号化（`cryptography`）による安全な永続化、末尾4桁以外のマスキング対応済み。 |
| **Requirement 2: 画像解析 & 分類推論**<br>- 明細・日付・店舗・ポイント抽出<br>- Zaim マスタコンテキスト注入<br>- マスタデータのレスポンス付与<br>- Data URL / Base64 受理 | - [`routers/gemini.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/routers/gemini.py)<br>- [`services/gemini.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/services/gemini.py)<br>- [`schemas.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/schemas.py) | **Implemented** | Pydantic スキーマ（`ReceiptParserResult`）による Structured Outputs、Base64 プレフィックスの自動サニタイズ対応済み。 |
| **Requirement 3: フォールバック解析**<br>- モデル優先チェーン<br>- 例外時の自動フォールバック<br>- 早期リターン | - [`services/gemini.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/services/gemini.py) | **Implemented** | `GEMINI_MODEL_CHAIN` リストにより優先順に非同期呼び出しを実施。 |
| **Requirement 4: 入力検証 & エラーハンドリング**<br>- Base64 不正（400）<br>- API キー / Zaim 未設定（400）<br>- レート制限 429 処理<br>- サーバーエラー 500 処理 | - [`routers/gemini.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/routers/gemini.py)<br>- [`services/gemini.py`](file:///c:/Users/ykoba/.gemini/antigravity/scratch/zaim-lens/services/gemini.py) | **Implemented** | `google.genai.errors.APIError` の HTTP 429 を個別捕捉し、ユーザー向けガイダンスを返却。 |

---

## 3. Implementation Approach Evaluation

本仕様は既存コードの仕様化（リバースエンジニアリング・ドキュメンテーション）であるため、現状の実装をベースに今後の拡張・保守方針を検討します。

### Option A: 現行実装の維持と仕様ドキュメント同期（推奨）
- **概要**: 既存の `routers/gemini.py` および `services/gemini.py` のアーキテクチャをそのまま採用し、仕様書（`design.md`）と整合させる。
- **メリット**:
  - 実装変更・リグレッションのリスクがゼロ。
  - テストコードの作成やモデルチェーンのパラメータチューニングに注力できる。
- **デメリット**:
  - 特になし。

### Option B: モデルチェーン設定の外出し・構成管理の改善
- **概要**: `GEMINI_MODEL_CHAIN` などの固定設定を環境変数または設定ファイルから動的に制御可能にする。
- **メリット**:
  - Google のモデル廃止・新モデル追加（Gemini 2.5 / 3.0 等）時にコード修正なしで対応可能。
- **デメリット**:
  - 設定項目が増える。

---

## 4. Complexity & Risk Assessment
- **Effort**: **S (1–2 days)** — 既存実装が完成しているため、設計書の策定およびユニットテストの追加のみで完結可能。
- **Risk**: **Low** — 既存の確立されたパターン（FastAPI, google-genai, Fernet）に完全に合致しており、技術的未知数はない。

---

## 5. Research Items for Design Phase
1. **Gemini SDK 最新仕様との整合性**:
   - `google-genai` SDK（0.1.x / 1.x 系）の非同期 API（`client.aio.models.generate_content`）の利用パターンと Structured Outputs スキーマ設定の確認。
2. **ユニットテスト・モック戦略**:
   - Gemini API 呼び出しのモック化による自動テスト（CI/CD）の設計。
