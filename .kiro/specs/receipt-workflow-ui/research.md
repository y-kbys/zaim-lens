# Implementation Gap Analysis: receipt-workflow-ui

## 1. 概要 (Executive Summary)
本ドキュメントは、`receipt-workflow-ui`（レシート解析・編集・登録 UI ワークフロー）の要件と既存フロントエンド/バックエンド実装とのギャップ分析結果です。  
既存の `static/js/features/receipt/` 配下の ES モジュールおよび Jinja2 テンプレート（`_parser_panel.html`, `_modals.html`）は、レシートのキュー処理、画像圧縮、明細編集、Zaim 登録、重複検知の基本構造を既に備えています。  
本仕様の主眼は、`gemini-api-backend` および `zaim-integration` の最新 API スキーマとの完全な整合、エラー・エッジケース時の UI 誘導の堅牢化、および操作性の向上にあります。

---

## 2. 現状のコードベース調査 (Current State Investigation)

### 2.1 既存のアセットと責務配置
| ファイルパス | 種別 | 現在の主な責務 |
| :--- | :--- | :--- |
| `static/js/features/receipt/index.js` | JS Module | イベントリスナー初期化、Lightbox 制御、一括カテゴリ適用 |
| `static/js/features/receipt/queue.js` | JS Module | 複数画像キュー管理、順次バックグラウンド圧縮・解析、`advanceQueue` |
| `static/js/features/receipt/ui.js` | JS Module | 明細リストのレンダリング、合計金額計算、カテゴリ/ジャンル連動、Undo |
| `static/js/features/receipt/image.js` | JS Module | Canvas を用いたクライアント側画像リサイズ・Base64 圧縮 |
| `static/js/features/receipt/api.js` | JS Module | `/api/parse-receipt` および `/api/register` の API コールとエラーハンドリング |
| `templates/components/_parser_panel.html` | Template | アップロード画面、画像プレビュー、明細編集テーブル、各種ボタン |
| `templates/components/_modals.html` | Template | Lightbox、重複確認ダイアログ（`duplicate-modal`）、エラーモーダル |
| `static/js/state.js` | JS Module | グローバル `appState`（キュー、解析結果、アカウント一覧、トークン等） |

---

## 3. 要件と実装のギャップ分析 (Requirements Feasibility & Gap Map)

| 要件 ID & 名称 | 既存アセット | ギャップ分類 | ギャップ内容と必要な対応 |
| :--- | :--- | :--- | :--- |
| **Req 1: レシート取り込み・キュー管理** | `queue.js`, `image.js`, `_parser_panel.html` | [Extend Existing] | ファイル選択・カメラ・D&D・貼り付けの全ルートでの複数画像キュー追加処理の堅牢化。キューサムネイルのステータスバッジ同期。 |
| **Req 2: Gemini API 解析・進捗表示** | `queue.js`, `api.js`, `_parser_panel.html` | [Constraint] | `gemini-api-backend` 仕様（`POST /api/parse-receipt`）のレスポンス形式（マスタカテゴリ・ジャンル同梱）および HTTP 400/429/500 エラーハンドリングの完全準拠。 |
| **Req 3: インタラクティブ確認・編集** | `ui.js`, `_parser_panel.html` | [Extend Existing] | カテゴリ変更時のジャンル連動、品目追加/削除/Undo、ポイント利用額（割引）計算、リアルタイム合計額再計算、必須項目バリデーションの強化。 |
| **Req 4: Zaim 支出登録と重複検知** | `api.js`, `_modals.html`, `ui.js` | [Constraint] | `zaim-integration` 仕様（`POST /api/register`）との連携。重複候補検知時の確認ダイアログ（詳細比較表示）と強制登録フラグ（`force: true`）の再送フロー。 |
| **Req 5: 連携状態・アカウント連動** | `ui.js`, `auth.js`, `state.js` | [Extend Existing] | 未ログイン/未連携時のガイドバナー制御、Zaim アカウント切り替え時の口座一覧・カテゴリ一覧の動的再適用。 |

---

## 4. 実装アプローチの比較検討 (Implementation Approaches)

### Option A: 既存 ES モジュールの拡張・洗練 (推奨 / Preferred)
- **概要**: `static/js/features/receipt/` 配下の既存モジュール構造を維持し、API スキーマの整合性向上、バリデーション強化、重複モーダル制御の改善を実施する。
- **メリット**:
  - 既存のクリーンな設計（UI・API・キュー・画像処理の分離）を最大限活用できる
  - 差分が局所的でリグレッションのリスクが極めて低い
  - ビルド不要の Vanilla JS / ES Modules の軽量性を維持
- **デメリット**:
  - モジュール間の状態共有（`appState`）の整合性を注意深く管理する必要がある

### Option B: フロントエンドフレームワーク / モノリシック再構築
- **概要**: React/Vue や単一の大きな JS ファイルに再構成する。
- **デメリット**: 依存関係やビルドステップが増加し、現行の軽量なアーキテクチャ定義（FastAPI + Jinja2 + Vanilla JS）から逸脱するため不採用。

### Option C: ワークフロー状態管理の明示化（ステートマシン層の導入）
- **概要**: 既存モジュールをベースにしつつ、`workflowState`（Idle → Parsing → Reviewing → ConfirmingDuplicate → Registering → Done）の遷移を明示的にカプセル化する。
- **メリット**: 複雑なキュー処理と重複確認フローの不整合を予防できる。
- **採用方針**: Option A の拡張として、状態遷移管理を整理して取り込む。

---

## 5. 見積もり規模とリスク評価 (Complexity & Risk)

- **開発規模 (Effort)**: **M (3–5 日)**
  - 理由: 画面構造や基本ロジックは実装済みであり、API スキーマ整合、重複制御のブラッシュアップ、バリデーション・エラーフィードバックの強化が中心となるため。
- **リスク (Risk)**: **Low**
  - 理由: バックエンド（`gemini-api-backend`, `zaim-integration`）との通信仕様が明確に規定されており、外部新規ライブラリの追加も不要なため。

---

## 6. 設計フェーズに向けた推奨事項 (Recommendations for Design Phase)

1. **API スキーマ・契約の完全統一**:
   - `gemini-api-backend` の `ParseReceiptResponse`（品目、日付、店舗、ポイント、マスタデータ）
   - `zaim-integration` の `RegisterReceiptRequest`（`receipt_group_id`, `force`, `from_account_id`）および重複レスポンス構造の型/定義の整合。
2. **重複確認モーダルの UX 向上**:
   - 重複候補の日付・金額・既存明細サマリーを分かりやすく提示し、ユーザーが「登録続行」「キャンセル」を迷わず選択できる UI 設計。
3. **入力バリデーションと即時フィードバック**:
   - 日付未指定、品名空欄、不正な金額（0円以下・非数値）の検出と視覚的エラー表示。
