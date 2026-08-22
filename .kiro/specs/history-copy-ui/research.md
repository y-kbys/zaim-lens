# Implementation Gap Analysis: history-copy-ui

## 1. 現状調査 (Current State Investigation)

### 1.1 既存資産・ディレクトリ構成
Zaim Lens におけるアカウント間履歴コピー機能は、既に以下の構成でフロントエンドおよびバックエンドに実装が存在します。

- **テンプレート**:
  - `templates/components/_copy_panel.html`: コピー元設定、期間選択、履歴一覧アコーディオン、コピー先設定、完了画面コンテナ
  - `templates/components/_modals.html`: `#copy-confirm-modal`（確認モーダル）、`#confirm-modal`（重複検知等の汎用確認ダイアログ）
- **フロントエンドスクリプト**:
  - `static/js/features/history/index.js`: コピー画面の初期化、イベント監視、期間計算、グルーピング、API呼び出し制御
  - `static/js/features/history/ui.js`: アコーディオン一覧描画、確認モーダルリスト生成、カテゴリ/ジャンル選択肢連動、選択件数カウント
  - `static/js/features/history/api.js`: `/api/history` (GET), `/api/copy` (POST) バックエンド通信
  - `static/js/state.js`: `appState.fetchedHistory`, `appState.selectedHistoryIds`, `appState.copyMasterData`, `appState.destInternalAccounts`
- **バックエンド連携**:
  - `routers/zaim.py`: `/api/history` (履歴取得), `/api/copy` (一括コピー実行・重複検知)
  - `schemas.py`: `CopyRequest`, `CopyItem`, `RegisterRequest`

### 1.2 アーキテクチャ規約・パターン
- **Vanilla JS + Tailwind CSS**: 外部フロントエンドフレームワークを用いず、ネイティブ DOM 操作と Tailwind CSS クラス切り替え（`hidden`, `flex` 等）でステップ遷移を制御。
- **状態管理**: `appState` シングルトンオブジェクトに履歴データおよび選択中アイテムのセット（`Set`）を保持。
- **ローカルストレージ**: 直近に利用したコピー元アカウントID、コピー先アカウントID、出金元口座IDをブラウザに自動保存・復元。

---

## 2. 要件適合度とギャップ分析 (Requirements Feasibility & Gap Analysis)

| 要件 ID | 要件項目 | 現行コードベースの対応状況 | ギャップ分類 |
| :--- | :--- | :--- | :--- |
| **Requirement 1** | 履歴取得条件の設定とアカウント選択 | `source-account-select`, `history-period-select` (今月/先月/過去1ヶ月/3ヶ月/月指定/カスタム), `resolveDateRange` で完全対応済み | **対応済み (None)** |
| **Requirement 2** | 履歴一覧のアコーディオン表示と選択操作 | `groupPaymentsByReceipt`, `renderHistoryList`, 親子チェックボックス連動 (`indeterminate` 対応), 全選択/全解除 (`btn-select-all`) 実装済み | **対応済み (None)** |
| **Requirement 3** | コピー先アカウントおよび出金元口座の指定 | `dest-account-select`, `loadDestInternalAccounts`, 選択件数カウンターおよび確認ボタン活性/非活性連動 実装済み | **対応済み (None)** |
| **Requirement 4** | コピー内容の確認とカテゴリ・口座付け替え | `renderConfirmList`, カテゴリ/ジャンル動的セレクト連動 (`updateCopyItemCategory`), レシートごとの出金元口座個別設定 実装済み | **対応済み (None)** |
| **Requirement 5** | コピー実行・重複検知ハンドリング・完了表示 | `buildCopyPayloadFromModal`, `/api/copy` 呼び出し, `duplicate_found` 警告ダイアログと `force=true` 再試行, 完了画面・リセット 実装済み | **対応済み (None)** |

### 潜在的な課題および技術的負債（Constraints & Refinement Opportunities）
1. **グローバルスコープ（`window`）へのイベント関数公開**:
   - `templates` 内の HTML 文字列生成時に `onclick="toggleItemSelection(...)"` や `onchange="updateCopyItemCategory(...)"` を埋め込んでいるため、`window` に関数をアタッチしている。イベント委譲（Event Delegation）への整理が将来的な保守性向上に寄与する。
2. **エラーハンドリングとローディングの統一**:
   - API 通信エラー時のトースト表示やスケルトン/スピナー表示が `dom.js` に依存しており、一貫性を保つ必要がある。

---

## 3. 実装アプローチの比較 (Implementation Approach Options)

### Option A: 現行実装ベースの仕様化と保守（推奨）
- **概要**: 既に動作している `static/js/features/history/` および `_copy_panel.html` を正本として仕様書（Design / Tasks）を定義し、仕様とコードの整合性を保ちながら保守・改善を進める。
- **メリット**:
  - ゼロから作り直すコストが発生せず、即座に仕様駆動開発（SDD）のサイクルに乗せられる。
  - 実装と要件の乖離が極めて小さい。
- **デメリット**:
  - 現行のインラインイベント等の小さな負債がそのまま残る（後続のリファクタリングタスクで対応可能）。

### Option B: 新規フロントエンド構造への全面刷新
- **概要**: コンポーネント指向フレームワークやカスタムWebコンポーネントを用いてゼロから再構築する。
- **メリット**:
  - 最新のコンポーネント設計を適用できる。
- **デメリット**:
  - アプリケーション全体の Vanilla JS 方針（`architecture.md`）に反し、工数・リスクが増大する。

---

## 4. 工数・リスク評価 (Implementation Complexity & Risk)

- **Effort**: **S (1〜2日)**
  - 既存コードが既にすべての受け入れ基準を満たして動作しており、新規開発ではなく仕様の整合化および動作検証が主となるため。
- **Risk**: **Low (低リスク)**
  - 既存パターンを踏襲しており、バックエンド API（`zaim-integration`）との連携インターフェースも確立しているため。

---

## 5. 設計フェーズへの推奨事項 (Recommendations for Design Phase)
1. **設計書の構成**:
   - `templates/components/_copy_panel.html` および `static/js/features/history/` のモジュール責務、データフロー、状態遷移図（Idle → Fetching → Ready → Confirming → Copying → Success）を明確に記述する。
2. **リファクタリングタスクの切り出し**:
   - グローバルイベントバインディングからイベントリスナー/イベント委譲への段階的移行を Tasks に含めるか検討する。
