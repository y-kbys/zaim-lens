# Requirements Document

## Introduction
Zaim Lens におけるレシート解析・編集・登録 UI ワークフローの要件定義書です。  
ユーザーがレシート画像やオンラインショップの購入明細スクリーンショットをアップロード（またはカメラ撮影・貼り付け）し、Gemini API による高速かつ高精度な自動解析結果を確認・編集した上で、Zaim 家計簿へスムーズに支出登録を完了できる一連のクライアント操作体験を提供します。

## Boundary Context
- **In scope**:
  - レシート画像（ファイル選択、カメラ撮影、ドラッグ＆ドロップ、クリップボード貼り付け）の入力受付とクライアント側プレビュー・画像最適化
  - 複数レシートの一括アップロードおよび解析キュー管理（解析順序制御、レシート切り替え、削除）
  - Gemini API 解析リクエストの送信、解析中プログレス/ローディング表示、およびエラーハンドリング
  - 解析されたレシートメタデータ（店舗名、購入日、支出元口座）および品目明細（品名、金額、カテゴリ、ジャンル、ポイント利用額）の確認・インタラクティブ編集
  - 品目編集に伴う合計金額のリアルタイム再計算およびカテゴリ・ジャンル選択肢の連動更新
  - Zaim への支出一括登録実行、重複警告検知時の確認モーダル表示、強制登録制御、および登録完了後のキュー進行
  - ユーザーのログイン状態・Zaim 連携状態・Gemini API キー設定状態に応じた UI ガイドおよび操作制限
- **Out of scope**:
  - バックエンド側での Gemini OCR 解析処理・モデルフォールバックロジック（`gemini-api-backend` 仕様の所掌）
  - バックエンド側での Zaim OAuth 認証処理・API 通信・暗号化永続化（`zaim-integration` 仕様の所掌）
  - Zaim 支出履歴コピー専用パネルの機能（別 UI / 機能仕様）
- **Adjacent expectations**:
  - `gemini-api-backend` からレシート構造化データおよびマスタカテゴリ・ジャンルが返却されること
  - `zaim-integration` から有効な口座一覧および重複検知結果が返却され、支出登録 API が利用可能であること
  - Firebase Authentication によるユーザー認証トークンが有効であること

## Requirements

### Requirement 1: レシート画像の取り込みとキュー管理
**Objective:** As a ユーザー, I want 撮影画像やスクリーンショットを柔軟に取り込み、複数レシートをまとめて管理したい, so that 溜まったレシートを効率的に順次処理できる

#### Acceptance Criteria
1. When ユーザーがファイル選択、ドラッグ＆ドロップ、カメラ撮影、またはクリップボード貼り付け（Paste）を行ったとき, the Receipt Workflow UI shall 画像ファイルを受け付けて解析キューに追加し、サムネイルプレビューを表示する
2. When 画像がキューに追加されたとき, the Receipt Workflow UI shall クライアント側で画像を適切な解像度および容量に最適化（リサイズ・圧縮）して保持する
3. When キュー内に複数のレシートが存在するとき, the Receipt Workflow UI shall ユーザーが選択したレシートへアクティブ表示を切り替え、未処理・処理中・完了のステータスをバッジ表示する
4. When ユーザーがキュー内の特定レシートの削除を指示したとき, the Receipt Workflow UI shall 当該レシートをキューから破棄し、残りのレシート一覧を表示更新する

### Requirement 2: Gemini API によるレシート解析と進捗表示
**Objective:** As a ユーザー, I want 画像の解析処理の進行状況を把握し、完了後に抽出結果を直ちに確認したい, so that 待ち時間の不安なくスムーズに次の確認作業へ進める

#### Acceptance Criteria
1. When レシート画像の解析を開始したとき, the Receipt Workflow UI shall 解析処理中であることを示すプログレス表示またはアニメーションを表示し、重複送信を防止する
2. When バックエンドから解析結果を受信したとき, the Receipt Workflow UI shall 店舗名、購入日、品目リスト（品名・金額・カテゴリ・ジャンル）、ポイント利用額を各入力欄に自動反映する
3. If 画像解析中に API キー未設定または Zaim 未連携エラーを受信したとき, then the Receipt Workflow UI shall 設定誘導メッセージおよび該当設定モーダルを開くボタンを表示する
4. If バックエンドからレート制限（HTTP 429）または解析失敗（HTTP 500）を受信したとき, then the Receipt Workflow UI shall エラー内容を通知し、再試行ボタンを提供する

### Requirement 3: 解析結果のインタラクティブな確認・編集
**Objective:** As a ユーザー, I want 抽出された店舗名、日付、品目、金額、カテゴリ、ジャンルを自由に編集したい, so that 誤認識を修正し、意図通りの家計簿データを作成できる

#### Acceptance Criteria
1. When ユーザーが店舗名、購入日、または支出元口座を変更したとき, the Receipt Workflow UI shall 変更内容を即座に入力欄に反映し、登録データとして保持する
2. When ユーザーが特定の品目のカテゴリを変更したとき, the Receipt Workflow UI shall 選択されたカテゴリに紐づくジャンル一覧を即座に連動更新し、ジャンル選択を可能にする
3. When ユーザーが品目の追加または削除を行ったとき, the Receipt Workflow UI shall 明細リストを更新し、合計金額をリアルタイムに再計算して表示する
4. Where レシートにポイント利用（割引）が存在する場合, the Receipt Workflow UI shall ポイント利用額入力フィールドに数値を反映し、実支払合計額の計算に反映する
5. If 必須項目（購入日、品目名、有効な金額）に空文字や不正な数値が入力されたとき, then the Receipt Workflow UI shall 該当箇所をハイライト表示し、登録ボタンを無効化する

### Requirement 4: Zaim への支出登録と重複検知フロー
**Objective:** As a ユーザー, I want 編集した明細をワンクリックで Zaim に登録し、二重登録を未然に防ぎたい, so that 正確な家計簿記録を安心して残せる

#### Acceptance Criteria
1. When ユーザーが「Zaimに登録」ボタンをクリックしたとき, the Receipt Workflow UI shall 現在アクティブな Zaim アカウントおよび編集済み明細データを送信して登録を要求する
2. If バックエンドから同一日付・同一合計金額の重複候補が存在する警告を受信したとき, then the Receipt Workflow UI shall 既存の重複支出情報とともに確認ダイアログを表示し、強制登録（登録を続行）またはキャンセルの選択を求める
3. When ユーザーが確認ダイアログで強制登録を承認したとき, the Receipt Workflow UI shall 強制フラグを有効にして支出登録を再送信する
4. When 支出登録が正常に完了したとき, the Receipt Workflow UI shall 成功トースト通知を表示し、当該レシートをキューから完了状態へ移行させ、次の未処理レシートがある場合は自動で選択する

### Requirement 5: 連携状態・アカウント連動と UI ガイド
**Objective:** As a ユーザー, I want 自身のアカウント連携状態に応じた適切な案内を受け、対象アカウントを素早く切り替えたい, so that 迷わず安全に操作できる

#### Acceptance Criteria
1. While ユーザーが未ログインまたは Zaim 未連携である間, the Receipt Workflow UI shall レシートアップロードエリアに連携を促すガイドバナーを表示し、解析実行ボタンを非活性にする
2. When ユーザーが複数の連携済み Zaim アカウントを保有しているとき, the Receipt Workflow UI shall 登録先アカウントを選択するドロップダウンを提供し、選択されたアカウントに応じたマスタデータ（口座・カテゴリ）を適用する
3. When Zaim アカウントが切り替えられたとき, the Receipt Workflow UI shall 該当アカウントの口座一覧およびカテゴリ一覧を再取得またはキャッシュから適用し、編集画面の選択肢を更新する
