# Requirements Document

## Introduction
Zaim Lens における Google Gemini API を用いたレシートおよび購入履歴画像解析バックエンドの要件定義書です。
本システムは、ユーザーが撮影したレシート画像やオンラインショップの購入履歴スクリーンショットから、品目名・金額・日付・店舗名・ポイント利用額を自動抽出し、Zaim のカテゴリおよびジャンルへ高精度に分類推論する機能を提供します。また、個人用 API キーの安全な管理と、可用性を高めるためのモデルフォールバック機構を備えます。

## Boundary Context
- **In scope**:
  - ユーザー固有の Gemini API キーの登録・取得（マスク表示）・削除機能
  - 画像データ（Base64形式）からのレシート明細（品目、金額、購入日、店舗名、ポイント利用額）の抽出
  - ユーザーの Zaim マスタデータ（カテゴリ・ジャンル）に基づく各品目のカテゴリ・ジャンル推論
  - 複数モデル（Gemini Flash Lite, Gemma 4, Gemini Flash 等）によるフォールバック試行制御
  - 入力検証（Base64整合性、キー未設定、Zaim未連携）およびレートリミット等のエラーハンドリング
- **Out of scope**:
  - フロントエンド UI コンポーネントおよび画面レイアウト実装
  - Zaim への支出・明細データの本登録処理（`/api/register` は別仕様）
  - Zaim OAuth 認証フロー自体
- **Adjacent expectations**:
  - 認証ミドルウェアから有効な `user_id` が提供されること
  - Zaim マスタデータ連携機能からカテゴリおよびジャンル情報が取得可能であること

## Requirements

### Requirement 1: Gemini API 認証情報の管理
**Objective:** As a ユーザー, I want 自身の Gemini API キーを登録・確認・削除したい, so that 個人用の API キーを用いて画像解析を実行できる

#### Acceptance Criteria
1. When ユーザーが新しい Gemini API キーを送信したとき, the Backend Service shall APIキーを暗号化してユーザー設定に保存し、成功メッセージを返す
2. When ユーザーが API キーの設定状態を問い合わせたとき, the Backend Service shall APIキーの設定有無フラグ（`is_configured`）と末尾4桁以外をマスクした文字列（`api_key_last_4`）を返す
3. When ユーザーが API キーの削除を要求したとき, the Backend Service shall 保存済みの API キー設定を削除し、成功メッセージを返す
4. Where ユーザー独自の API キーが未設定かつシステム共通の環境変数キーが存在する場合, the Backend Service shall システム共通キーを解析処理で利用可能とする

### Requirement 2: レシートおよび購入履歴スクショの画像解析
**Objective:** As a ユーザー, I want レシートや購入履歴の画像を送信して自動解析させたい, so that 日付・店舗・品目・金額・カテゴリを自動抽出できる

#### Acceptance Criteria
1. When Base64エンコードされた画像データが送信されたとき, the Backend Service shall 画像から購入日（YYYY-MM-DD形式）、店舗名、各品目一覧（品名・金額）、ポイント利用額を抽出する
2. While 画像解析を実行する間, the Backend Service shall ユーザーの Zaim カテゴリおよびジャンル一覧をコンテキストとして組み込み、各品目に最も適した `category_id` と `genre_id` を推論して割り当てる
3. When 画像解析が正常に完了したとき, the Backend Service shall 構造化された解析結果とともに、UIでの選択肢表示用としてマスタカテゴリおよびジャンル一覧をレスポンスに含めて返す
4. The Backend Service shall Data URL プレフィックス（`data:image/...;base64,`）付きの画像データおよび純粋な Base64 文字列の両方を正常に受理してデコードする

### Requirement 3: 複数モデルによるフォールバック解析
**Objective:** As a システム, I want 優先モデルが失敗した場合にフォールバックモデルで解析を継続したい, so that APIの一時的な障害や制限時にも解析成功率を高められる

#### Acceptance Criteria
1. When 画像解析リクエストを受信したとき, the Backend Service shall 定義されたモデルチェーンの優先順（`gemini-flash-lite-latest` → `gemma-4-26b-a4b-it` → `gemini-flash-latest`）に従って順次解析を試行する
2. If 特定のモデルでの呼び出しが例外やエラーで失敗したとき, the Backend Service shall モデルチェーン内の次のモデルで即座に再試行する
3. When モデルチェーン内のいずれかのモデルで正常に応答が得られたとき, the Backend Service shall 以降のモデル呼び出しを行わずにその解析結果を確定して返す

### Requirement 4: 入力検証とエラーハンドリング
**Objective:** As a ユーザー, I want 不正な入力や API キー未設定、レート制限などの失敗理由を正確に把握したい, so that 適切な対処を行える

#### Acceptance Criteria
1. If 送信された画像データが無効またはデコード不可能な Base64 文字列であるとき, the Backend Service shall HTTP 400 エラーと無効な画像データである旨のメッセージを返す
2. If ユーザー固有の API キーおよびシステム共通キーの双方が未設定であるとき, the Backend Service shall HTTP 400 エラーと API キー設定を促すメッセージを返す
3. If ユーザーの Zaim 連携設定が存在しないとき, the Backend Service shall HTTP 400 エラーと Zaim 連携を促すメッセージを返す
4. If モデルチェーン内のすべてのモデルでレート制限（HTTP 429）に達したとき, the Backend Service shall HTTP 429 エラーと時間をおいて再試行を促すメッセージを返す
5. If モデルチェーン内のすべてのモデルで解析に失敗したとき, the Backend Service shall HTTP 500 エラーと失敗詳細を含むエラーメッセージを返す
