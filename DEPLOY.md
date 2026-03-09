# Deployment Guide (Cloud Run)

このプロジェクトを Google Cloud Run にデプロイするための手順と、運用上の注意点をまとめます。

## 1. 自動デプロイ (GitHub Actions)

`main` ブランチへの push をトリガーとして、GitHub Actions により Cloud Run へ自動デプロイされます。

### 事前準備
デプロイを成功させるには、GCP と Firebase の設定、および GitHub Secrets の登録が必要です。
詳細は **[CLOUD_SETUP.md](./CLOUD_SETUP.md)** を参照してください。

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
# ... 他の必須変数 ...
ENCRYPTION_KEY: "your_secure_string"
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

## 3. アカウント設定について (Zaim Credentials)

Zaim の API 認証情報（Consumer Key, Access Token など）は**環境変数から設定する必要はありません**。

アプリの初回起動・ログイン後、UI 上の「Zaim連携設定」から直接入力してください。入力された情報は Firebase Firestore に安全に保存され、複数アカウントの切り替えも可能です。

## 4. プロジェクト構造
- `main.py`: FastAPI バックエンド
- `DEVELOPMENT.md`: ローカル開発環境の構築ガイド
- `CLOUD_SETUP.md`: クラウドインフラ（GCP/Firebase）の構築ガイド
- `Dockerfile`: Cloud Run 用のコンテナ定義
- `.github/workflows/deploy.yml`: 自動デプロイ定義
