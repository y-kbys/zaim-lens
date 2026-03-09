# Zaim Developer Console Setup Guide

このドキュメントでは、Zaim Lens をホスティング（運用）する開発者の方が、Zaim API の Consumer Key と Consumer Secret を取得し、OAuth 1.0a 連携を構成するための手順を説明します。

## 1. Zaim 開発者センターへの登録

1.  **[Zaim 開発者センター](https://dev.zaim.net/)** にログインします。
2.  「新しいアプリケーションを追加」をクリックします。

## 2. アプリケーション設定

以下の項目を入力してアプリケーションを登録してください。

-   **名称**: `Zaim Lens` (または任意の名前)
-   **サービス種**: クライアントアプリ
-   **概要**: `AIを活用したレシート解析とアカウント間同期ツール` (任意)
-   **組織**: `個人` (任意)
-   **サービスのURL**: `https://your-your-app.a.run.app/api/zaim/callback`
    -   本番環境のドメインに合わせて設定してください。
    -   ローカル開発用には `http://localhost:8080/api/zaim/callback` を追加登録するか、別のアプリとして登録することをお勧めします。
-   **アクセスレベル**: **3点とも** チェックを入れてください（必須）。（レシートの登録や履歴のコピー機能を使用するために必要です。）
    -   家計簿の記録を読み込む
    -   家計簿の記録を書き込む
    -   家計簿へのアクセスを永続的に許可する

## 3. Key の取得と適用

登録完了後、画面に表示される以下の情報をコピーします。

-   **コンシューマ ID**
-   **コンシューマシークレット**

これらをアプリケーションの環境変数として設定してください。

### 本番環境 (Cloud Run 等) の場合
`DEPLOY.md` に従い、環境変数 `ZAIM_CONSUMER_KEY` および `ZAIM_CONSUMER_SECRET` にセットします。
また、`ZAIM_CALLBACK_URL` に設定したコールバックURLをセットしてください。

### ローカル開発環境の場合
`.env` ファイルに以下を追記します。

```env
ZAIM_CONSUMER_KEY=あなたのConsumerKey
ZAIM_CONSUMER_SECRET=あなたのConsumerSecret
ZAIM_CALLBACK_URL=http://localhost:8080/api/zaim/callback
```

## 注意事項

-   コールバックURLが一致しない場合、OAuth 認証時にエラーが発生します。
-   Consumer Secret は他人に知られないよう、安全に管理してください。
