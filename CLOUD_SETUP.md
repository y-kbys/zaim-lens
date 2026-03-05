# Cloud Infrastructure Setup Guide (GCP & Firebase)

Zaim Lens を自前でホスティング（Cloud Run 等）するための初期設定ガイドです。

## 1. Firebase の設定

Zaim Lens は認証とデータ保存に Firebase を使用します。

1. **Firebase プロジェクトの作成:** [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成します（GCPプロジェクトと統合されます）。
2. **Authentication の有効化:**
   - 「Authentication」メニューから「始める」をクリック。
   - 「ログイン メソッド」タブで **Google** を有効にします。
3. **Firestore Database の作成:**
   - 「Firestore Database」メニューからデータベースを作成します（本番環境モードを選択してください）。
   - ※ 本アプリはすべてのデータベースアクセスを安全なバックエンド (Cloud Run) 経由で行うため、Firestore のセキュリティルールは初期状態の **「すべての読み書きを拒否 (allow read, write: if false;)」** のままで問題ありません。
4. **ウェブアプリの登録:**
   - プロジェクト設定の「マイアプリ」から「ウェブアプリ (< />)」アイコンをクリックして登録。
   - 表示される `firebaseConfig` の値を控えておいてください。

## 2. Google Cloud Platform (GCP) の設定

### Workload Identity Federation (WIF) の構築
GitHub Actions から安全にデプロイするために、サービスアカウントキーを発行せず WIF を使用します。

1. **サービスアカウントの作成:** デプロイ用の権限（Cloud Run 管理者、ストレージ管理者、サービスアカウントユーザー等）を持つアカウントを作成します。
2. **WIF プールとプロバイダーの作成:** GitHub リポジトリからのアクセスを許可する設定を行います。
   - [公式ドキュメント](https://github.com/google-github-actions/auth#preferred-direct-workload-identity-federation)を参照して、`workload_identity_provider` ID を取得してください。

## 3. GitHub Secrets の設定

GitHub リポジトリの `Settings > Secrets and variables > Actions` に、以下の秘密情報を登録してください。

### デプロイ認証用 (GitHub Actions)
| 名前 | 説明 |
| :--- | :--- |
| `WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL_ID>/providers/<PROVIDER_ID>` |
| `WIF_SERVICE_ACCOUNT` | デプロイ用サービスアカウントのメールアドレス |

### アプリケーション用 (Cloud Run 環境変数)
これらの値はデプロイ時に `env.yaml` を介して Cloud Run の環境変数に設定されます。すべて設定が必須です。

| 名前 | 説明 |
| :--- | :--- |
| `GEMINI_API_KEY` | **(必須)** Google Gemini API キー |
| `FIREBASE_API_KEY` | **(必須)** Firebase `apiKey` |
| `FIREBASE_PROJECT_ID` | **(必須)** Firebase `projectId` (GCPのプロジェクトIDと同一) |
| `FIREBASE_AUTH_DOMAIN` | **(必須)** Firebase `authDomain` |
| `FIREBASE_STORAGE_BUCKET` | **(必須)** Firebase `storageBucket` |
| `FIREBASE_MESSAGING_SENDER_ID` | **(必須)** Firebase `messagingSenderId` |
| `FIREBASE_APP_ID` | **(必須)** Firebase `appId` |
| `FIREBASE_MEASUREMENT_ID` | **(必須)** Firebase `measurementId` |
| `ENCRYPTION_KEY` | **(必須)** Zaim 連携情報の暗号化キー。設定漏れやデフォルト値の場合、セキュリティ保護のためアプリが起動しません。 |

## 4. セキュリティに関する注意

- **Firestore セキュリティルール:** 本アプリはサーバーサイド（firebase-admin SDK）からデータにアクセスするため、Firestore のルールを「読み書き拒否 (`allow read, write: if false;`)」に設定していても正常に動作します。クライアント（ブラウザ）からの直接アクセスを防ぐため、この設定を強く推奨します。
- **API キーの制限:** `GEMINI_API_KEY` は Google Cloud Console で使用可能なサービスや IP アドレスの制限を設定しておくことを強く推奨します。
