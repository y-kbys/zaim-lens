# Implementation Gap Analysis & Research Log: receipt-workflow-ui

## 1. 概要 (Executive Summary)
本ドキュメントは、`receipt-workflow-ui`（レシート解析・編集・登録 UI ワークフロー）の要件と既存フロントエンド/バックエンド実装とのギャップ分析および設計ディスカバリーログです。  
既存の `static/js/features/receipt/` 配下の ES モジュールおよび Jinja2 テンプレート（`_parser_panel.html`, `_modals.html`）は、レシートのキュー処理、画像圧縮、明細編集、Zaim 登録、重複検知の基本構造を備えています。  
今回のスコープ追加では、複数レシート処理時に「全スキップされた場合（登録件数が0件の場合）は完了画面を出さず静かに初期トップ画面へ復帰する」ライフサイクル制御を明確化し、API スキーマ整合および堅牢な UX を実現します。

---

## 2. 現状のコードベース調査 (Current State Investigation)

### 2.1 既存のアセットと責務配置
| ファイルパス | 種別 | 現在の主な責務 |
| :--- | :--- | :--- |
| `static/js/features/receipt/index.js` | JS Module | イベントリスナー初期化、Lightbox 制御、スキップ操作バインド、一括カテゴリ適用 |
| `static/js/features/receipt/queue.js` | JS Module | 複数画像キュー管理、登録件数追跡、順次バックグラウンド圧縮・解析、`advanceQueue` |
| `static/js/features/receipt/ui.js` | JS Module | 明細リストのレンダリング、合計金額計算、カテゴリ/ジャンル連動、Undo、リセット処理 |
| `static/js/features/receipt/image.js` | JS Module | Canvas を用いたクライアント側画像リサイズ・Base64 圧縮 |
| `static/js/features/receipt/api.js` | JS Module | `/api/parse-receipt` および `/api/register` の API コールとエラーハンドリング |
| `templates/components/_parser_panel.html` | Template | アップロード画面、画像プレビュー、明細編集テーブル、各種ボタン（登録・スキップ） |
| `templates/components/_modals.html` | Template | Lightbox、重複確認ダイアログ（`duplicate-modal`）、エラーモーダル |
| `static/js/state.js` | JS Module | グローバル `appState`（キュー、登録済件数カウンタ、解析結果、アカウント一覧等） |

---

## 3. 要件と実装のギャップ分析 (Requirements Feasibility & Gap Map)

| 要件 ID & 名称 | 既存アセット | ギャップ分類 | ギャップ内容と必要な対応 |
| :--- | :--- | :--- | :--- |
| **Req 1: レシート取り込み・キュー管理** | `queue.js`, `image.js`, `_parser_panel.html` | [Extend Existing] | ファイル選択・カメラ・D&D・貼り付けの全ルートでの複数画像キュー追加。スキップ操作時の次レシート進行制御。 |
| **Req 2: Gemini API 解析・進捗表示** | `queue.js`, `api.js`, `_parser_panel.html` | [Constraint] | `gemini-api-backend` 仕様（`POST /api/parse-receipt`）のレスポンス形式および HTTP 400/429/500 エラーハンドリング準拠。 |
| **Req 3: インタラクティブ確認・編集** | `ui.js`, `_parser_panel.html` | [Extend Existing] | カテゴリ変更時のジャンル連動、品目追加/削除/Undo、ポイント利用額（割引）計算、リアルタイム合計額再計算、必須項目バリデーション。 |
| **Req 4: Zaim 支出登録と完了フロー** | `api.js`, `queue.js`, `ui.js` | [Extend Existing] | 支出登録成功時の登録件数インクリメント（`appState.registeredReceiptCount`）。キュー終了時に登録件数が1件以上なら完了画面、0件なら `resetApp()` で初期画面へ復帰する分岐制御。 |
| **Req 5: 連携状態・アカウント連動** | `ui.js`, `auth.js`, `state.js` | [Extend Existing] | 未ログイン/未連携時のガイドバナー制御、Zaim アカウント切り替え時の口座一覧・カテゴリ一覧の動的再適用。 |

---

## 4. 設計ディスカバリー & アーキテクチャ判断

### 4.1 キュー終了・スキップ時の状態遷移ライフサイクル
- **課題**: 現行実装ではキューの末尾に到達した際（`advanceQueue()`）、登録成功有無にかかわらず無条件で `switchState('state-success')` を呼び出していたため、すべてのレシートをスキップした場合にも「登録完了」画面が表示されていた。
- **決定方針**:
  - `appState` に `registeredReceiptCount` を導入。
  - `handleImageFiles()` 等の新規キュー投入時に `registeredReceiptCount = 0` に初期化。
  - 支出登録 API（`/api/register`）が成功するごとに `registeredReceiptCount++` をインクリメント。
  - `advanceQueue()` で全キュー消化時（`currentQueueIndex >= queue.length`）に判定：
    - `registeredReceiptCount > 0`: `switchState('state-success')`（完了画面へ遷移）
    - `registeredReceiptCount === 0`: `resetApp()`（初期アップロード画面へ静かに復帰し、不要な完了表示を行わない）

---

## 5. 見積もり規模とリスク評価 (Complexity & Risk)

- **開発規模 (Effort)**: **S〜M**
- **リスク (Risk)**: **Low** (既存キューマネージャーのカウンタ管理と終了分岐の追加のみで安全に実現可能)
