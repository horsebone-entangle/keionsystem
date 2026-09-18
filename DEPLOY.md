# Sites公開

このプロジェクトは静的HTMLだけでは動作しません。WorkerのAPIとD1データベースが必要です。

1. `pnpm install`、`pnpm test`、`pnpm build` を実行。
2. `.openai/hosting.json` の同じproject_idとDBバインドを保持。
3. ソースをSitesのリポジトリに保存し、`dist/` のWorker、manifest、`drizzle/`マイグレーションを含むバージョンを公開。
4. 初回は所有者限定でアクセスし、管理者を設定。
5. 部員へ利用を開放する場合は、Sites側の閲覧者設定を別途変更。

公開パッケージにはソースやローカルSQLiteを含めません。永続データはSitesのD1に保存されます。DBスキーマは公開時のマイグレーションで管理し、リクエスト中にテーブルを作成しません。

旧Vercel静的配信設定とSupabase設定は現行の公開手順では使用しません。
