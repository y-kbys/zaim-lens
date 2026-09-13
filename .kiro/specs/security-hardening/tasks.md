# Implementation Plan: security-hardening

- [x] 1. Firebase JWT 手動検証の厳格化とルーズフォールバック削除
  - トークン手動検証ロジックから `verify_aud=False`, `verify_iss=False` を指定したフォールバックデコード処理を完全に撤廃する
  - 対象プロジェクト ID（Audience）または発行者（Issuer）が一致しないトークンを受信した場合、例外をそのまま上位へ送出して 401 Unauthorized エラーを返却する
  - 有効な署名かつ正しいプロジェクト ID を持つ正規トークンのみが UID を解決して認証を通過することを確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Boundary: Authentication Service_

- [x] 2. (P) 履歴コピーおよび画像解析リクエストのサイズ・件数上限バリデーション
  - `CopyRequest` スキーマの `items_to_copy` フィールドに最小 1 件、最大 100 件の境界値制約（`min_length=1, max_length=100`）を設定する
  - `ParseRequest` スキーマの `image_base64` フィールドに最小 1 文字、最大 14,000,000 文字（約10MB相当）の境界値制約（`min_length=1, max_length=14_000_000`）を設定する
  - 101 件以上のアイテムコピーや 14,000,000 文字を超える画像データを受信した際、エンドポイント到達前に 422 Unprocessable Entity で即時遮断されることを確認する
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_
  - _Boundary: Request Schemas_

- [ ] 3. (P) OAuth 一時シークレット辞書の TTL 期限管理とオンデマンド掃除処理の実装
  - 一時シークレット保持用辞書に保存するデータ構造へ登録時刻（`created_at: time.time()`）を追加する
  - 現在時刻から 10 分（600 秒）を超過した古いエントリを抽出して破棄するオンデマンドクリーンアップ関数を実装し、ログインおよびコールバック処理の入口で実行する
  - コールバック受信時にデータが存在しない、または有効期限切れとなっている場合はセッション切れエラーとして安全にリダイレクト処理を行う
  - 登録から 10 分以上経過した未完了セッションのデータがサーバーメモリ上に残留せず確実に削除されることを確認する
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - _Boundary: OAuth Session Manager_

- [ ] 4. (P) Firestore 全拒否セキュリティルールと GitHub Actions 自動デプロイの設定
  - リポジトリルートにクライアントからの直接の読み書きを全遮断する `firestore.rules`（`allow read, write: if false;`）を作成する
  - Firebase CLI 連携設定ファイル `firebase.json` を作成し、Firestore ルールファイルと紐付ける
  - GitHub Actions デプロイワークフロー（`.github/workflows/deploy.yml`）に `firebase-tools` を用いたルール自動デプロイステップを追加する
  - 既存のサーバーサイド特権アクセスに影響を与えず、外部クライアントからの直接アクセスのみが拒絶される設定が確立されていることを確認する
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: Infrastructure & CI/CD_

- [ ] 5. セキュリティ強化機能の自動テスト追加と全体回帰テストの実行
  - 不正なプロジェクト ID を持つトークンが 401 で遮断され、正規トークンのみが受理されることを検証する単体テストを追加する
  - アイテム数 0 件および 101 件のコピーリクエスト、および 14,000,000 文字超の画像リクエストが 422 で拒否される境界値テストを追加する
  - OAuth 一時シークレット辞書の 10 分経過エントリが自動破棄され、有効期限内のエントリは保持されることを検証するテストを追加する
  - `uv run pytest` による全バックエンドテストおよび `npm run check` によるフロントエンド検証を実行し、すべてのテストが Green であることを確認する
  - _Depends: 1, 2, 3, 4_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_
  - _Boundary: Test Suite_
