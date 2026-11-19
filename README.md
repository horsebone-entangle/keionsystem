# 軽音楽部 音楽室予約システム

既存のHTML画面を活かし、サーバーAPIと永続データベースを実装しています。Vercel + Supabase PostgreSQLに対応しています。従来のSites Worker + D1とローカルSQLiteも保持しています。Node.js 24以降を使用し、デモデータへのフォールバックはありません。公開手順は`DEPLOY.md`を参照してください。

## 利用開始

1. 初回アクセス時に管理者の学籍番号・氏名・10文字以上のパスワードを設定します。固定の初期パスワードはありません。本番の初期設定はSitesにサインインした所有者用の非公開サイトで行います。
2. 「部員・申請管理」でCSVを取り込みます。password列が空欄の未登録部員には招待コードを発行します。画面のダウンロードリンクから保存して本人に渡してください。
3. 部員は学籍番号、登録済み氏名、招待コードと希望パスワードで登録します。
4. バンド申請を管理者が承認すると所属情報が反映され、バンド予約が可能になります。

新規Siteは所有者限定です。部員と使う場合はSites側の閲覧者設定も必要です。学籍番号によるログインはSitesの閲覧制限とは別です。

## 機能

- 今日から14日間の個人・所属バンド予約、取消、月間上限。
- 曜日と個別日のコマ開放設定、当月の利用集計。
- バンド作成・メンバー変更・解散申請、管理者による承認・却下、自分の申請状況。
- 部員CSV取り込み、検索、管理者権限の付与・解除。
- HttpOnlyセッションCookie、PBKDF2パスワードハッシュ、ログイン試行制限、同一オリジンの書き込み制限。
- DBトリガーと一意制約による重複予約・上限・所属制限。承認とバンド変更は単一トランザクション。解散時は未来のバンド予約を取り消します。

## ローカル開発

Node.js 24以降とpnpmを使用します。

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
```

起動先は `http://127.0.0.1:4173`。データはGit管理対象外の `.local/keion.sqlite` に保存されます。ローカルのデータやテストアカウントは本番へ送信しません。

## Supabase migration: step 1

The server-only PostgreSQL connection module is `server/postgres.mjs`.
Vercel uses this module through `api/index.js` and `server/postgres-database.mjs`.
Local development uses PostgreSQL when DATABASE_URL is configured, otherwise SQLite.
Copy `.env.example` to `.env` locally and set DATABASE_URL to your Supabase
transaction pooler URI. Percent-encode the password component when necessary.
Never put this value in browser JavaScript or commit it to Git.

Run `pnpm db:check` to perform a read-only `SELECT 1` connection check.
No tables are created or modified. TLS certificate verification stays enabled.
If a custom CA is required, set DATABASE_CA_CERT to its PEM contents.
For Vercel, set DATABASE_URL in the server environment settings instead of uploading `.env`.

## CSV

```csv
student_id,name,role,password
s260001,山田太郎,member,
s260002,佐藤花子,member,
```

roleはmemberまたはadmin。1回300名まで。登録済みアカウントのパスワードは再取込で上書きしません。未登録部員を再取込すると招待コードは再発行されます。パスワードを指定する場合は10〜128文字。

## 構成・検証

- `server/api.mjs`: 認証、権限、予約・申請・管理API
- `db/schema.ts` / `drizzle/`: D1のスキーマと生成済みマイグレーション
- `scripts/local-db.mjs`: 同じSQLを用いるローカルSQLiteとD1互換アダプター
- `scripts/build.mjs`: 公開対象の画面・資産だけを含むWorkerを生成
- `tests/api.test.mjs`: 認証、招待、権限、競合、予約制約、承認の原子性、永続化、非公開ファイルの検証

スキーマ変更後は `pnpm db:generate`。適用済みのマイグレーションは変更せず、新規分を追加します。

`supabase/schema.sql`と`config*.js`は旧試作版の資料で、現在のアプリは使用・配信しません。旧SQLは平文パスワードと匿名書き込みを含むため実行しないでください。PostgreSQLの新スキーマとトリガーは`supabase/migrations/`、Vercel設定は`vercel.json`です。`db/schema.ts`と`drizzle/`は従来のSQLite/D1専用です。既存データの移行はこの実装には含まれません。
