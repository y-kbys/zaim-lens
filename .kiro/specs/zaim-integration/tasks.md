# Implementation Tasks: zaim-integration

## Task Progression

- [x] 1. データモデルおよびクレデンシャル管理の改修・マスキング対応
- [x] 1.1 `schemas.py` への `ZaimCredentialsResponse` 追加と `routers/zaim.py` のマスキング改修 (P)
  - `GET /api/zaim/credentials/{account_id}` で生シークレットを返却せず、`is_configured`, `consumer_key_last_4`, `token_last_4` を返すようモデルおよびルーターを改修
  - 存在しないアカウント指定時に HTTP 404 を返却することを確認
  - _Requirements: 2.1, 2.4, 2.5_
  - _Boundary: schemas.py, routers/zaim.py_
- [x] 1.2 `services/zaim_client.py` における個別 Consumer Key 優先利用とセッション生成の改修 (P)
  - アカウント設定内に個別の `consumer_key` / `consumer_secret` が設定されている場合、システム環境変数より優先して `OAuth1Session` に渡すロジックを実装
  - アカウント未登録時または認証情報不備時に HTTP 400 を返却することを確認
  - _Requirements: 1.1, 1.2, 2.4, 3.3_
  - _Boundary: services/zaim_client.py_

- [x] 2. Zaim OAuth 1.0a 認証連携およびアカウント管理のユニット・統合テスト
- [x] 2.1 OAuth 認証開始・トークン交換のモックテスト作成 (`tests/test_zaim_oauth.py`) (P)
  - `get_zaim_authorization_params` および `exchange_zaim_access_token` のモックテストを実装
  - セッション欠落やトークン交換エラー時に適切なエラーハンドリングが行われることを検証
  - テストが PASS することを確認
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Boundary: tests/test_zaim_oauth.py_
- [x] 2.2 アカウント管理 API（一覧取得、名称更新、削除、手動クレデンシャル）のテスト作成 (`tests/test_zaim_api.py`) (P)
  - `GET /api/zaim/status`, `GET /api/accounts`, `PATCH /api/zaim/credentials/{account_id}/name`, `DELETE /api/zaim/disconnect/{account_id}`, `POST /api/zaim/credentials` のテストを実装
  - クレデンシャル取得時に末尾4桁のみが返却され、生シークレットが露出しないことを検証
  - テストが PASS することを確認
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - _Boundary: tests/test_zaim_api.py_

- [x] 3. マスタデータ取得および支出登録・重複検知のテストと検証
- [x] 3.1 マスタデータ取得（カテゴリ・ジャンル・口座）のテスト作成 (P)
  - `GET /api/zaim/categories` および `GET /api/zaim/accounts`（非アクティブ口座除外）のモックテストを実装
  - 未連携アカウント指定時に HTTP 400 エラーが返却されることを検証
  - テストが PASS することを確認
  - _Requirements: 3.1, 3.2, 3.3_
  - _Boundary: tests/test_zaim_service.py_
- [x] 3.2 支出登録ロジックおよび重複検知のユニットテスト作成 (`tests/test_zaim_service.py`) (P)
  - `register_receipt_items` による複数品目・同一 `receipt_id` 紐付け登録、ポイント利用額（マイナス明細）の登録を検証
  - `check_zaim_duplicate` による同一日付・同一合計金額の重複判定ロジックを検証
  - テストが PASS することを確認
  - _Requirements: 4.1, 4.2, 4.3_
  - _Boundary: tests/test_zaim_service.py_
- [x] 3.3 支出登録 API (`/api/register`) の統合テスト作成 (`tests/test_zaim_api.py`) (P)
  - `force=false` で重複検知時に warning レスポンスが返却され、`force=true` で強制登録されることを検証
  - 登録成功時に登録件数と成功ステータスが返却されることを検証
  - テストが PASS することを確認
  - _Requirements: 4.3, 4.4, 4.5_
  - _Boundary: tests/test_zaim_api.py_

- [x] 4. 支出履歴取得およびアカウント間コピーのテストと全体検証
- [x] 4.1 支出履歴取得 API (`/api/history`) のテスト作成 (P)
  - カテゴリ名・ジャンル名が付与された履歴一覧の返却を検証
  - 期間および日付範囲パラメータによる絞り込みが機能することを検証
  - テストが PASS することを確認
  - _Requirements: 5.1_
  - _Boundary: tests/test_zaim_api.py_
- [x] 4.2 アカウント間履歴コピー API (`/api/copy`) のテスト作成 (P)
  - レシートグループ単位での同一レシート ID 生成、表示順序維持登録、コピー先での重複検知警告、成功件数返却を検証
  - テストが PASS することを確認
  - _Requirements: 5.2, 5.3, 5.4_
  - _Boundary: tests/test_zaim_api.py_
- [x] 4.3 全体統合テスト実行と回帰確認
  - `uv run pytest` を実行し、新規追加テストおよび既存テスト（暗号化、Gemini API 解析）がすべて PASS することを確認
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4_
  - _Boundary: tests/_
