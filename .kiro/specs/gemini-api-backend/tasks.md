# Implementation Tasks: gemini-api-backend

## Task Progression

- [x] 1. Gemini API 認証情報管理のテストと検証
- [x] 1.1 `db.py` の API キー暗号化・復号処理のユニットテスト作成 (P)
  - Fernet 暗号化による `gemini_api_key` の暗号化・復号ラウンドトリップを検証するテストを実装
  - 暗号化キー未設定時や空文字列時のフォールバック動作を検証
  - テストが PASS することを確認
  - _Requirements: 1.1, 1.2, 1.3_
  - _Boundary: db.py_
- [x] 1.2 `/api/gemini/credentials` エンドポイントのルーティング・マスク表示テスト作成 (P)
  - GET（設定有無フラグと末尾4桁マスク表示）、POST（保存）、DELETE（削除）エンドポイントの挙動を検証
  - ユーザーキー未設定時に環境変数 `GEMINI_API_KEY` へフォールバックするロジックを検証
  - テストが PASS することを確認
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Boundary: routers/gemini.py_

- [x] 2. レシート画像解析および Zaim マスタコンテキスト生成の検証
- [x] 2.1 Zaim マスタコンテキスト生成関数（`build_prompt_context`）のテスト作成 (P)
  - カテゴリおよびジャンル階層がプロンプト文字列に正しくフォーマットされることを検証
  - ジャンルが空のカテゴリや特殊文字が含まれる場合のフォーマットを検証
  - テストが PASS することを確認
  - _Requirements: 2.2_
  - _Boundary: routers/gemini.py_
- [x] 2.2 Data URL プレフィックスおよび Base64 サニタイズ処理のテスト作成 (P)
  - `data:image/jpeg;base64,...` プレフィックス付きおよびプレーンな Base64 文字列が正しくデコードされることを検証
  - 不正な Base64 文字列送信時に HTTP 400 エラーが発生することを検証
  - テストが PASS することを確認
  - _Requirements: 2.4, 4.1_
  - _Boundary: services/gemini.py_

- [x] 3. GenAI モデルフォールバックおよびエラーハンドリングの検証
- [x] 3.1 GenAI クライアント呼び出しのモックと構造化パースのテスト作成 (P)
  - Google GenAI SDK の非同期呼び出し（`client.aio.models.generate_content`）をモック化
  - 正常な JSON 応答から `ReceiptParserResult`（品目、金額、日付、店舗、ポイント）が正しくパースされることを検証
  - テストが PASS することを確認
  - _Requirements: 2.1, 2.3, 3.3_
  - _Boundary: services/gemini.py_
- [x] 3.2 複数モデル優先チェーンのフォールバック動作テスト作成 (P)
  - `GEMINI_MODEL_CHAIN`（Flash Lite → Gemma 4 → Flash）の優先順位に従って順次再試行されることを検証
  - 第1モデル失敗（例外発生）時に第2モデルで成功して結果が返却されることを検証
  - テストが PASS することを確認
  - _Requirements: 3.1, 3.2_
  - _Boundary: services/gemini.py_
- [x] 3.3 レート制限（HTTP 429）および全モデル失敗時の例外ハンドリングテスト作成 (P)
  - GenAI SDK の `errors.APIError` (code 429) 受信時にユーザー向けメッセージを含む HTTP 429 例外が発生することを検証
  - 全モデルで解析失敗した場合に HTTP 500 例外が発生することを検証
  - テストが PASS することを確認
  - _Requirements: 4.4, 4.5_
  - _Boundary: services/gemini.py_

- [x] 4. `/api/parse` エンドポイントの統合検証
- [x] 4.1 設定不備（APIキー未設定、Zaim未連携）時のバリデーションテスト作成 (P)
  - API キー未設定時に HTTP 400 エラーと案内メッセージが返ることを検証
  - Zaim 連携未設定時に HTTP 400 エラーと案内メッセージが返ることを検証
  - テストが PASS することを確認
  - _Requirements: 4.2, 4.3_
  - _Boundary: routers/gemini.py_
- [x] 4.2 `/api/parse` エンドポイントのエンドツーエンド（モック統合）テスト実行
  - 画像解析リクエスト送信から Zaim マスタデータ付与済みレスポンス（`master_categories`, `master_genres` 含む）の返却までの一連のフローをテスト
  - 全体テストスイートを実行し、全テストが PASS することを確認
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5_
  - _Boundary: routers/gemini.py_
