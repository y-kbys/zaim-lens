# Deployment Guide (Cloud Run)

このプロジェクトを Google Cloud Run にデプロイするための手順と、運用上の注意点をまとめます。

## 1. 自動デプロイ (GitHub Actions)

本プロジェクトは、ブランチベースのデプロイフローを採用しています。

- **`main` ブランチ**: 本番環境 (`prod`)。Cloud Run の `zaim-lens` サービスにデプロイされます。
- **`develop` ブランチ**: 開発環境 (`dev`)。Cloud Run の `zaim-lens-dev` サービスにデプロイされます。

### デプロイのトリガー
それぞれのブランチへの push をトリガーとして、GitHub Actions により対応する環境へ自動デプロイされます。

### 事前準備
1. **GCP/Firebase 設定**: 詳細は **[CLOUD_SETUP.md](./CLOUD_SETUP.md)** を参照してください。
2. **GitHub Environments**:
   - リポジトリの `Settings > Environments` から `prod` と `dev` を作成します。
   - それぞれの Environment に、同じ名前で環境ごとの値を持つ Secrets を登録します（例: `FIREBASE_API_KEY`）。

### ビルドプロセス
デプロイフローの中で以下のステップが自動的に実行されます：
1. **Node.js セットアップ:** `actions/setup-node` による環境構築。
2. **Tailwind CSS ビルド:** `npm install` および `npm run build:css` が実行され、静的な CSS ファイルが生成されます。
3. **PWA キャッシュ更新:** Commit ハッシュに基づき、`sw.js` のキャッシュ名が自動的に更新されます。

## 2. 手動デプロイ (gcloud CLI)

ローカル環境から直接デプロイ（Cloud Build 経由）する場合の手順です。

### 1. 手動ビルド
デプロイ前に最新のフロントエンド資産を生成してください。
```bash
npm install
npm run build:css
```

### 2. 環境変数の準備
デプロイ用の `env.yaml` を作成します。形式は以下の通りです。

```yaml
FIREBASE_API_KEY: "..."
FIREBASE_PROJECT_ID: "..."
ENCRYPTION_KEY: "your_secure_string"
ZAIM_CONSUMER_KEY: "..."
ZAIM_CONSUMER_SECRET: "..."
ZAIM_CALLBACK_URL: "https://your-app.a.run.app/api/zaim/callback"
```

### 3. デプロイコマンド
`--region` は利用者の所在地に近いリージョン（日本国内なら `asia-northeast1` など）を選択してください。

```bash
gcloud run deploy zaim-lens \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --env-vars-file env.yaml
```

## 3. Zaim OAuth 連携の設定

Zaim の API 連携には、デプロイ時に以下の環境変数を設定して Zaim 開発者センターと同期させる必要があります：
- `ZAIM_CONSUMER_KEY`: Consumer Key
- `ZAIM_CONSUMER_SECRET`: Consumer Secret
- `ZAIM_CALLBACK_URL`: コールバックURL

詳細な取得・設定手順は **[ZAIM_OAUTH_SETUP.md](./ZAIM_OAUTH_SETUP.md)** を参照してください。

## 4. プロジェクト構造
- `main.py`: FastAPI バックエンド
- `DEVELOPMENT.md`: ローカル開発環境の構築ガイド
- `CLOUD_SETUP.md`: クラウドインフラ（GCP/Firebase）の構築ガイド
- `Dockerfile`: Cloud Run 用のコンテナ定義
- `.github/workflows/deploy.yml`: 自動デプロイ定義
