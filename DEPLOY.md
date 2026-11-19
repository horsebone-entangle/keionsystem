# Vercel + Supabase公開

既存Vercelプロジェクトを使用します。画面だけの静的公開ではなく、`api/index.js`のNode.js APIとSupabase PostgreSQLを利用します。

## 1. ローカル設定

`.env.example`を参考に、プロジェクト直下の`.env`に`DATABASE_URL`を設定します。
値はSupabaseのTransaction pooler URI（ポート6543）。パスワード部分だけをパーセントエンコードします。
変数名`DATABASE_URL`は変更しません。`[YOUR-DATABASE-PASSWORD]`は実際のパスワードに置き換えます。
`.env`はGitにもVercelへのアップロードにも含まれません。

```powershell
node --env-file=.env scripts/check-postgres.mjs
node --env-file=.env scripts/migrate-postgres.mjs
```

新SQLは`supabase/migrations/`にあります。旧`supabase/schema.sql`は実行しません。
同名の旧テーブルが存在すると移行は全体をロールバックし、既存データを上書きしません。
既存SQLite/D1や旧Supabaseからのデータ移行は含まれません。別途バックアップと移行が必要です。
本番テーブルはRLS有効・ブラウザー用ロールのアクセス不可。DB所有者の接続はサーバーのみで使用します。
TLS検証は無効化しません。証明書エラー時はSupabaseのCA証明書を取得し、`DATABASE_CA_CERT`にPEMを設定してください。
ローカルでは証明書を保存し、`.env`に`DATABASE_CA_CERT_PATH=prod-ca-2021.crt`を指定する方法も使用できます。Vercelではローカルファイルのパスではなく、`DATABASE_CA_CERT`に証明書のPEM内容を設定してください。

## 2. 初期管理者

空のDBでのみ実行します。`.env`に以下を追加してください。

```dotenv
ADMIN_STUDENT_ID=希望する管理者の学籍番号
ADMIN_NAME=管理者の氏名
ADMIN_PASSWORD=10文字以上128文字以下の固有のパスワード
```

```powershell
node --env-file=.env scripts/create-admin.mjs
```

成功後、`.env`から`ADMIN_PASSWORD`等の初期管理者設定を削除します。
Vercelの公開画面から初期管理者を作ることはできません。固定管理者や初期パスワードもありません。

## 3. テストと既存Vercelプロジェクトへの反映

```powershell
node --test tests/*.test.mjs
node scripts/build-vercel.mjs
```

VercelプロジェクトのSettingsで以下を設定します。

- Environment Variables: `DATABASE_URL`（Production。必要なら分離したPreview用DBも設定）
- 必要な場合のみ`DATABASE_CA_CERT`
- Framework Preset: Other
- Node.js: 24.x
- Build Command: `node scripts/build-vercel.mjs`
- Output Directory: `public`

環境変数の変更後は再デプロイが必要です。`ADMIN_PASSWORD`やブラウザー用SupabaseキーはVercelに登録しません。
Git連携済みの場合は改修を既存リポジトリにpushし、既存プロジェクトでデプロイします。
CLIの場合は次の手順で既存プロジェクトを選択します。新規プロジェクトを作らないでください。

```powershell
pnpm dlx vercel login
pnpm dlx vercel link
pnpm dlx vercel --prod
```

公開後は`/`で管理者ログイン、CSV取込、部員登録、個人予約、バンド申請・承認、取消を確認します。
`/server/api.mjs`、`/.env`、`/supabase/schema.sql`が公開されていないことも確認します。
PreviewとProductionに同じDBを設定するとテスト予約も本番に保存されるため注意してください。

## ローカル動作

`node scripts/dev.mjs`は`.env`に`DATABASE_URL`があればPostgreSQL、なければ従来のSQLiteを使います。
URLは`http://127.0.0.1:4173`（`PORT`で変更可能）。PostgreSQL使用時も管理者は専用コマンドで作成します。
PGlite統合テストは独立したメモリー内PostgreSQLを使用し、本番データを変更しません。
PGliteは単一接続のため、Supabaseの実接続・TLS・複数接続でのロック競合は別途実環境確認が必要です。

公式資料: https://vercel.com/docs/functions/runtimes/node-js / https://node-postgres.com/features/transactions

# Sites公開（従来構成）

このプロジェクトは静的HTMLだけでは動作しません。WorkerのAPIとD1データベースが必要です。

1. `pnpm install`、`pnpm test`、`pnpm build` を実行。
2. `.openai/hosting.json` の同じproject_idとDBバインドを保持。
3. ソースをSitesのリポジトリに保存し、`dist/` のWorker、manifest、`drizzle/`マイグレーションを含むバージョンを公開。
4. 初回は所有者限定でアクセスし、管理者を設定。
5. 部員へ利用を開放する場合は、Sites側の閲覧者設定を別途変更。

公開パッケージにはソースやローカルSQLiteを含めません。永続データはSitesのD1に保存されます。DBスキーマは公開時のマイグレーションで管理し、リクエスト中にテーブルを作成しません。

Sites用ビルドは従来どおり`node scripts/build.mjs`で生成できます。Vercel用ビルドとは別です。
