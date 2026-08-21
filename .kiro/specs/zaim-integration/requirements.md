# Requirements Document

## Introduction
Zaim Lens における家計簿サービス「Zaim」とのアカウント連携、マルチアカウント管理、マスタデータ取得、支出データ登録、および履歴コピー機能に関する要件定義書です。  
ユーザーが複数の Zaim アカウントを安全に連携・切り替えできるようにし、レシート解析データからの支出登録（重複検知・ポイント割引対応）やアカウント間での履歴コピーを確実に行えるバックエンド機能を提供します。

## Boundary Context
- **In scope**:
  - OAuth 1.0a（3-legged）による Zaim アカウント認証連携およびトークンの安全な保存
  - 複数 Zaim アカウントの管理（一覧取得、名称更新、連携解除/削除、手動クレデンシャル登録）
  - Zaim マスタデータ（カテゴリ、ジャンル、有効な口座一覧）の取得
  - レシート解析データに基づく Zaim への支出登録、ポイント利用額のマイナス登録、同一日付・金額の重複チェック
  - Zaim からの支出履歴取得（カテゴリ・ジャンル名付与）およびアカウント間での支出履歴コピー機能
- **Out of scope**:
  - レシート画像の OCR 解析および品目・カテゴリ推論（`gemini-api-backend` 仕様の所掌）
  - フロントエンド UI コンポーネントおよびスタイリングの実装
- **Adjacent expectations**:
  - 認証ミドルウェアから有効なユーザー識別子（UID）が提供されること
  - 支出登録時に有効なレシート解析データ（品目、金額、店舗名、日付等）が入力されること

## Requirements

### Requirement 1: Zaim OAuth 1.0a 認証連携
**Objective:** As a ユーザー, I want Zaim の公式認証画面を通じて安全にアカウントを連携したい, so that パスワードを預けることなく Zaim Lens から家計簿データを操作できる

#### Acceptance Criteria
1. When ユーザーが Zaim 連携開始を要求したとき, the Backend Service shall Zaim OAuth 認証 URL を生成してクライアントに返却する
2. When Zaim からの認証コールバックを受信したとき, the Backend Service shall 認可トークンをアクセストークンへ交換し、ユーザーのアカウント一覧に保存した上で連携完了画面へ遷移させる
3. If OAuth セッション情報が欠落または無効であるとき, the Backend Service shall 認証エラーを通知し、再試行を促す
4. If Zaim サービスとの通信障害またはトークン交換エラーが発生したとき, the Backend Service shall エラーメッセージを通知し、保存処理を中断する

### Requirement 2: Zaim マルチアカウント管理
**Objective:** As a ユーザー, I want 複数の Zaim アカウントを登録・管理したい, so that 用途や家族ごとの家計簿を個別に操作できる

#### Acceptance Criteria
1. When ユーザーが連携済みアカウント一覧を要求したとき, the Backend Service shall 各アカウントの識別子、設定名称、および連携状態を返却する
2. When ユーザーが特定アカウントの名称変更を要求したとき, the Backend Service shall アカウント名称を更新し、成功メッセージを返す
3. When ユーザーが特定アカウントの連携解除・削除を要求したとき, the Backend Service shall 当該アカウントの認証情報および関連キャッシュデータを削除し、成功メッセージを返す
4. When ユーザーが手動で Zaim API クレデンシャル（Consumer Key/Secret, Token/Secret）を送信したとき, the Backend Service shall 当該クレデンシャルを暗号化してアカウント情報として新規追加または更新する
5. If 存在しないアカウント識別子が指定されたとき, the Backend Service shall HTTP 404 エラーを返す

### Requirement 3: マスタデータ（カテゴリ・ジャンル・口座）の取得
**Objective:** As a ユーザー, I want Zaim に登録されているカテゴリ・ジャンルおよび口座一覧を取得したい, so that レシート解析や支出登録時に正しい分類を選択できる

#### Acceptance Criteria
1. When ユーザーが特定アカウントのカテゴリおよびジャンル一覧を要求したとき, the Backend Service shall 最新のマスタデータを取得してカテゴリ一覧とジャンル一覧を返却する
2. When ユーザーが支出元となる口座一覧を要求したとき, the Backend Service shall Zaim に登録された口座一覧のうち有効な（非アクティブでない）口座のみを抽出して返却する
3. If 指定されたアカウントが未連携または無効な認証情報であるとき, the Backend Service shall HTTP 400 または HTTP 401 エラーを返す

### Requirement 4: Zaim への支出登録と重複検知
**Objective:** As a ユーザー, I want 解析されたレシート明細を Zaim に一括登録し、重複登録を防止したい, so that 正確な家計簿を簡単に作成できる

#### Acceptance Criteria
1. When ユーザーが支出登録を要求したとき, the Backend Service shall レシートの各品目（金額、カテゴリ、ジャンル、品名）、店舗名、購入日、支出元口座、および同一レシート識別子を Zaim に登録する
2. Where レシートデータにポイント利用額（割引）が含まれる場合, the Backend Service shall ポイント利用額をマイナス金額の明細として Zaim に合わせて登録する
3. When 強制登録フラグ（force）が無効かつ同一日付・同一合計金額の支出が既に存在するとき, the Backend Service shall 登録を実行せずに重複候補が存在する旨の警告レスポンスを返す
4. When 強制登録フラグ（force）が有効であるとき, the Backend Service shall 重複候補の有無にかかわらず支出登録を実行する
5. When 支出登録が完了したとき, the Backend Service shall 正常に登録された明細件数と成功ステータスを返却する

### Requirement 5: 支出履歴取得とアカウント間コピー
**Objective:** As a ユーザー, I want Zaim の支出履歴を取得し、別アカウントへレシート単位でコピーしたい, so that 共有口座や別家計簿への転記作業を効率化できる

#### Acceptance Criteria
1. When ユーザーが期間または日付範囲を指定して履歴取得を要求したとき, the Backend Service shall 指定アカウントの支出明細にカテゴリ名・ジャンル名を付与した履歴一覧を返却する
2. When ユーザーが複数明細の別アカウントへのコピーを要求したとき, the Backend Service shall 同一レシート・グループに属する明細をまとめ、コピー先アカウントへ順序を維持して一括登録する
3. While コピー処理を実行する際, when 強制フラグが無効でコピー先に同一日付・同一合計金額の支出が存在するとき, the Backend Service shall 処理を中断して重複警告を返す
4. When コピー処理が正常に完了したとき, the Backend Service shall コピー成功件数を返却する
