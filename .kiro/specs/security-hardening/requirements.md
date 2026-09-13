# Requirements Document

## Introduction
本ドキュメントは、**Zaim Lens** において特定された認証バイパス脆弱性、過大データ・DoS耐性の欠如、およびインメモリセッションのメモリリークを解消し、インフラセキュリティルールをコード管理・自動適用するためのセキュリティ強化（`security-hardening`）の機能要件および受入基準を定義します。

## Boundary Context
- **In scope**:
  - 認証トークンにおける対象プロジェクトIDおよび発行者の厳格な検証（ルーズ検証の完全撤廃）
  - 履歴コピーAPIにおけるアイテム件数（最大100件）の上限検証
  - 画像解析APIにおける画像データ長（最大14,000,000文字 / 約10MB相当）の上限検証
  - OAuth連携一時セッションにおけるTTL（10分）期限切れ自動破棄
  - クライアント直接アクセスを全遮断するデータベースセキュリティルールの定義およびCI/CD自動デプロイ
- **Out of scope**:
  - 外部API（Gemini / Zaim）の利用クォータやレートリミット制御（BYOKポリシーに基づきユーザー自己責任とする）
  - Redis等の外部キャッシュサーバーの新規導入（インメモリTTL管理で充足）
  - フロントエンド画面デザインの大規模改修

## Requirements

### Requirement 1: Firebase 認証トークンの厳格な検証
**Objective:** As a system operator and user, I want the system to verify that incoming authentication tokens strictly match the application's project identity, so that cross-project token reuse and unauthorized tenant impersonation are prevented.

#### Acceptance Criteria
1. When 有効な署名かつ対象プロジェクト ID に一致する認証トークンを受信した時, the Auth System shall ユーザー ID (UID) を正常に解決してリクエストを許可する
2. If 認証トークンの対象者（Audience）または発行者（Issuer）がシステムに設定されたプロジェクト ID と一致しない場合, then the Auth System shall 401 Unauthorized エラーを返却してアクセスを拒絶する
3. If 認証トークンの署名が無効または破損している場合, then the Auth System shall 401 Unauthorized エラーを返却してアクセスを拒絶する
4. The Auth System shall 検証処理においてプロジェクト ID や発行者の検証をスキップするフォールバックを一切行わない

### Requirement 2: 履歴コピー API のアイテム数制限
**Objective:** As a system operator, I want the history copy API to reject requests exceeding the maximum allowed item count, so that worker starvation, timeouts, and external API rate limit violations are prevented.

#### Acceptance Criteria
1. When コピー対象アイテム数が 1 件以上 100 件以下のリクエストを受信した時, the History Copy Service shall コピー処理を正常に受け付けて実行する
2. If コピー対象アイテム数が 100 件を超えるリクエストを受信した場合, then the History Copy Service shall 422 Unprocessable Entity エラーを即座に返却して処理を中止する
3. If コピー対象アイテム数が 0 件（空リスト）のリクエストを受信した場合, then the History Copy Service shall 422 Unprocessable Entity エラーを即座に返却して処理を中止する

### Requirement 3: 画像解析リクエストのサイズ上限保護
**Objective:** As a system operator, I want the receipt parsing API to reject oversized image payloads, so that server memory exhaustion (OOM) and DoS attacks are prevented.

#### Acceptance Criteria
1. When 許容サイズ内（約10MB相当 / 14,000,000文字以下）の画像データを受信した時, the Receipt Parse Service shall 画像解析処理を正常に受け付けて実行する
2. If 画像データの文字長が上限（14,000,000文字）を超えるリクエストを受信した場合, then the Receipt Parse Service shall 422 Unprocessable Entity エラーを即座に返却してデコードおよび外部API呼び出しを行わない
3. If 画像データが空文字または無効なデータ形式の場合, then the Receipt Parse Service shall 400 Bad Request または 422 Unprocessable Entity エラーを返却して処理を中止する

### Requirement 4: OAuth 一時セッションの有効期限管理
**Objective:** As a system operator, I want temporary OAuth authentication secrets to expire automatically after a predefined time window, so that abandoned login attempts do not cause cumulative memory leaks.

#### Acceptance Criteria
1. When ユーザーが外部サービス連携を開始した時, the OAuth Session Manager shall 登録時刻とともに一時セッション情報を保持する
2. When 有効期間内（作成から 10 分以内）に外部サービスからのコールバックを受信した時, the OAuth Session Manager shall 一時セッション情報を取得して連携を完了し、使用済みデータを直ちに削除する
3. If 作成から 10 分を経過した一時セッション情報が存在する場合, then the OAuth Session Manager shall 当該期限切れデータを自動的に破棄する
4. If 期限切れまたは存在しないトークンでコールバックを受信した場合, then the OAuth Session Manager shall セッション切れエラーとして処理を拒絶する

### Requirement 5: データベースセキュリティルールの自動デプロイと完全遮断
**Objective:** As a system operator, I want database security rules denying all client direct access to be managed in code and automatically deployed, so that human configuration errors and direct client data tampering are prevented.

#### Acceptance Criteria
1. When CI/CD デプロイパイプラインが実行された時, the Deployment Pipeline shall クライアント直アクセスを全拒否するデータベースセキュリティルールを対象環境に自動適用する
2. The Database Security Rules shall クライアント（ブラウザ等）からの直接の読み書きリクエストをすべて拒絶する
3. The Backend Service shall サーバーサイド特権認証情報を用いて必要なデータ読み書きを正常に継続する
