# Local Development Guide

このドキュメントでは、Zaim Lens のソースコードをクローンして、ローカル環境で開発・実行するための手順を説明します。

## 前提条件

- **Python 3.11+**: バックエンド（FastAPI）の実行に必要です。
- **Node.js 20+**: Tailwind CSS v4 のビルドに必要です。
- **Google Cloud CLI**: ローカル環境からFirestoreへ安全にアクセスする（キーレス認証）ために必要です。

## セットアップ手順

### 1. リポジトリのクローン
```bash
git clone <repository-url>
cd zaim-lens
```

### 2. バックエンドの依存パッケージをインストール
uv を使用して、仮想環境の作成と依存関係のインストールを一度に行います。
```bash
uv sync
```

### 3. フロントエンドの依存パッケージをインストール
Tailwind CSS のビルドツールが含まれています。
```bash
npm install
```

### 4. Google Cloud への認証 (ADC)
本プロジェクトはセキュリティ向上のため、JSONキーを使用しないキーレス認証（Application Default Credentials）を採用しています。環境変数を設定する前に、以下のコマンドで GCP プロジェクトへアクセス可能なアカウントでログインしてください。

```bash
gcloud auth application-default login
```

### 5. 環境変数の設定
`.env.example` をコピーして `.env` ファイルを作成し、必要な値を設定してください。
```bash
cp .env.example .env
```
※ `GEMINI_API_KEY`, `ENCRYPTION_KEY`, `ZAIM_CONSUMER_KEY`, `ZAIM_CONSUMER_SECRET`, `ZAIM_CALLBACK_URL` および Firebase の設定値が必要です。
手順の詳細は **[ZAIM_OAUTH_SETUP.md](./ZAIM_OAUTH_SETUP.md)**, [DEPLOY.md](./DEPLOY.md), [CLOUD_SETUP.md](./CLOUD_SETUP.md) を参照してください。

## 開発・実行コマンド

> [!TIP]
> 開発時はターミナルを **2つ** 開き、以下の「バックエンドの起動」と「CSSの監視ビルド」をそれぞれ同時に実行してください。

### バックエンドの起動
uv を使用して実行します。
```bash
uv run python main.py
# または
uv run uvicorn main:app --reload --port 8080
```

### CSSのビルド (Tailwind CSS v4)
フロントエンドのスタイルを変更した場合、ビルドが必要です。

- **ファイル変更を監視して自動ビルド:**
  ```bash
  npm run watch:css
  ```
- **一度だけビルドを実行:**
  ```bash
  npm run build:css
  ```

## ディレクトリ構造
- `main.py`: FastAPI バックエンド（APIエンドポイント、認証、解析ロジック）
- `db.py`: Firestore との通信ロジック
- `static/`:
  - `input.css`: Tailwind CSS のソースファイル
  - `tailwind.css`: ビルドされたCSSファイル
  - `app.js`: フロントエンドのメインロジック
- `package.json`: Node.js のスクリプトと依存関係定義
