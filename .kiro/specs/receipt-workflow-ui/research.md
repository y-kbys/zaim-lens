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

---

## 6. 詳細ギャップ検証レポート (Post-Implementation Gap Validation)

### 6.1 現状の実装状況調査 (Current State Audit)
- **コアワークフロー (Core Workflow)**:
  - レシート取り込み（ファイル選択、カメラ撮影、D&D、Ctrl+V 貼り付け）から Canvas 最適化、Gemini API 解析、明細編集、重複検知確認、Zaim 登録、キュー進行までエンドツーエンドで動作。
  - スキップ時・登録完了時のライフサイクル制御（全スキップ時はトップ画面へ静かに復帰、1件以上登録時は完了画面表示）は `test_receipt_queue_logic.js` で単体テスト済み（13 passed）。
  - バックエンド統合テスト（`test_api_parse.py`, `test_zaim_service.py` など全37件）もオールグリーン。

### 6.2 要件フィービリティ・ギャップ詳細マッピング (Detailed Requirement Gap Map)

| 要件項目 & 受入基準 | 現行実装状況 | ギャップ分類 | 詳細内容と改善余地 |
| :--- | :--- | :--- | :--- |
| **Req 1.1: 複数ソースからの画像取り込み** | 実装済み | [Aligned] | ファイル選択、カメラ、D&D、Ctrl+V 貼り付けの全ルートに対応。 |
| **Req 1.2: クライアント側画像最適化** | 実装済み | [Aligned] | Canvas による長辺1600pxリサイズ・Base64圧縮（先頭即時・後続バックグラウンド逐次圧縮）。 |
| **Req 1.3: 複数レシート選択・ステータス表示** | 部分実装 | [Extend Existing] | バッチプログレスバーで枚数と状態は表示されるが、任意キューアイテムへの直接ジャンプ・選択UI（サムネイル一覧/カルーセル）は未提供。 |
| **Req 1.4: キュー内特定レシートの削除** | 部分実装 | [Extend Existing] | `removeQueueItem(index)` は実装済みだが、UI上にキューアイテムごとの個別削除ボタンが露出していない。 |
| **Req 1.5: アクティブなレシートのスキップ** | 実装済み | [Aligned] | `btnSkip` により次レシートへ進行し、全スキップ時は静かにトップへ復帰。 |
| **Req 2.1: 解析中プログレス・二重送信防止** | 実装済み | [Aligned] | ローディングオーバーレイ表示およびフラグによる多重送信ガード。 |
| **Req 2.2: 抽出結果の自動バインド** | 実装済み | [Aligned] | 日付、店舗、品目、カテゴリ、ジャンル、ポイント利用が反映される。 |
| **Req 2.3: APIキー/Zaim未設定時の誘導** | 実装済み | [Aligned] | HTTP 400 エラー捕捉時に設定モーダルを自動ポップアップ。 |
| **Req 2.4: レート制限(429)/エラー時の再試行** | 部分実装 | [Extend Existing] | トースト通知は表示されるが、インラインの明示的な「再試行」アクションボタンは未配置。 |
| **Req 3.1: 店舗・日付・口座の即時バインド** | 実装済み | [Aligned] | 変更が `appState.parsedData` に即時反映される。 |
| **Req 3.2: カテゴリ/ジャンル連動セレクト** | 実装済み | [Aligned] | カテゴリ変更時にジャンル一覧が動的に絞り込まれ、先頭ジャンルへ自動セット。一括変更メニューも提供。 |
| **Req 3.3: 品目追加・削除・Undo・リアルタイム合計** | 実装済み | [Aligned] | 行追加・行削除、Undo スナックバー、合計金額の即時再計算が動作。 |
| **Req 3.4: ポイント利用額の反映** | 実装済み | [Constraint] | 負の金額の品目「ポイント利用」として明細に挿入して合計控除。専用独立入力欄ではないがZaim登録仕様と整合。 |
| **Req 3.5: 必須項目のリアルタイム検証とボタン制御** | 部分実装 | [Extend Existing] | 登録ボタン押下時にトースト警告・フォーカス移動する方式。入力中の赤枠ハイライトおよびボタンのリアルタイム非活性化（Disabled）は未実装。 |
| **Req 4.1-4.4: Zaim登録・重複確認・キュー進行** | 実装済み | [Aligned] | 重複検知時の確認ダイアログ（`showConfirm`）、強制登録（`force: true`）、登録完了後の次キュー進行が連動。 |
| **Req 4.5-4.6: 完了画面 vs 全スキップ復帰** | 実装済み | [Aligned] | `registeredReceiptCount` に基づく分岐が実装・テスト済み。 |
| **Req 5.1: 未連携時のガイドバナー表示** | 部分実装 | [Extend Existing] | アカウントセレクトに「Zaim設定が必要です」と表示されるが、専用の案内バナーコンポーネントは未配置。 |
| **Req 5.2-5.3: マルチアカウント・マスタ動的同期** | 実装済み | [Aligned] | ドロップダウン変更時に口座およびカテゴリ・ジャンルが再読込・反映される。 |

---

### 6.3 実装アプローチの比較評価 (Implementation Approach Options)

残存ギャップ（キュー一覧・個別削除UI、リアルタイム入力バリデーション、再試行ボタン、未連携時ガイドバナー）の解消に向けたアプローチ検討：

#### Option A: 既存コンポーネントの順次拡張 (Extend Existing Components) - 【推奨】
- **方針**:
  - `templates/components/_parser_panel.html` のプログレスバーまたは編集画面上部に、キュー内サムネイル一覧（削除ボタン付き）を追加。
  - `static/js/features/receipt/ui.js` に `validateReceiptInputs()` を追加し、`input` イベントで赤枠付与および `btnRegister.disabled` をリアルタイム切り替え。
  - エラー発生時、トーストだけでなく `state-upload` またはプログレスバー内に「再試行」ボタンを表示。
- **トレードオフ**:
  - ✅ 既存のファイル構成・イベントフローを壊さず最小限の変更で要件充足度を100%に引き上げ可能。
  - ✅ 新規依存やライブラリの追加が不要。
  - ❌ `ui.js` の行数がやや増加する。

#### Option B: キュー管理とバリデーションの新コンポーネント分離 (Create New Components)
- **方針**:
  - キューUI専用の `static/js/features/receipt/queue_ui.js` およびバリデーション専用の `validator.js` を新設。
- **トレードオフ**:
  - ✅ モジュールごとの単一責任がより明確化され、単体テストが容易になる。
  - ❌ 状態（`appState`）の共有や既存の `ui.js` / `index.js` との相互インポートが増加し、設計の複雑度が増す。

#### Option C: ハイブリッドアプローチ (Hybrid Approach)
- **方針**:
  - バリデーション等の純粋関数ロジックのみ独立ファイル（`validator.js`）として切り出してテスト容易性を高め、DOM操作やUI反映は既存の `ui.js` / `_parser_panel.html` を拡張。
- **トレードオフ**:
  - ✅ テスタビリティと開発効率のバランスが良い。
  - ❌ ファイル数が増えるため、小〜中規模な本プロジェクトでは過剰設計の可能性がある。

---

### 6.4 規模・リスク評価 (Complexity & Risk)
- **開発規模 (Effort)**: **S** (1〜2日程度)
  - 既存のバックエンドAPIおよびフロントエンド中核ロジック（`queue.js`, `image.js`, `api.js`）は完成しており、残存ギャップはUIインタラクションおよびバリデーションの拡張のみ。
- **リスク (Risk)**: **Low**
  - 既存の単体テスト（`node:test` 13件）および pytest（37件）が整備されており、機能追加時の回帰を即座に検知可能。

---

### 6.5 設計・実装フェーズへの推奨事項 (Recommendations for Next Phase)
1. **推奨アプローチ**: **Option A (既存コンポーネントの順次拡張)** を採用。
2. **優先着手項目**:
   - **キューサムネイル一覧 & 削除導線**: 複数枚投入時に各画像のサムネイルチップと削除 `×` ボタンを表示し、任意のレシートへの切り替えと `removeQueueItem()` の発火を実現。
   - **リアルタイムバリデーション**: 日付・品名・金額の `input` 監視による赤枠ハイライトと登録ボタンの活性/非活性制御。
   - **再試行ボタン**: レートリミット（429）や通信エラー時に、当該キューアイテムを即座に再解析できるボタンのUI配置。
