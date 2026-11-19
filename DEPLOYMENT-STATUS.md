# Vercel / Supabase対応状況（2026-11-20 JST）

- 対象リポジトリ: https://github.com/horsebone-entangle/keionsystem
- 対象の既存公開URL: https://keionsystem.vercel.app/
- PostgreSQL接続・SQLマイグレーション・予約ガード・承認トリガー・Vercel API入口を実装。
- ローカルテスト16件成功。SupabaseへのCA証明書によるTLS接続も成功。複数接続での本番ロック競合は未検証。
- Vercel用公開資産ビルドと従来Workerビルド成功。ローカルHTTPの主要ページ・APIは200を確認。
- 既存Vercel本番URLへ反映済み。Deployment: `dpl_7JpBqZJ95S5MB5rySbevT5Zx8ZHw`（READY）。
- 本番`/api/state`は200、匿名時に部員情報が返らないことを確認。管理者ログイン200・セッション取得200・ログアウト200を確認。
- 予約・申請・両管理ページ200、`/.env`・`/server/api.mjs`・`/supabase/schema.sql`は404を確認。
- ローカル`.env`設定済み。空のpublicスキーマを確認後、本番マイグレーション適用成功。11テーブルのRLS有効を確認。
- 初期管理者作成済み。サーバーAPIでログイン200・admin権限を確認し、確認用セッションを削除済み。
- Vercel CLI認証・既存`take9n/keionsystem`へのリンク済み。ProductionにDATABASE_URLとDATABASE_CA_CERTをSecretとして登録済み。ADMIN_PASSWORDはVercelに送信していない。
- ローカルから本番ビルドを作成・検証後にpromote済み。GitHubへのcommit/pushは未実行。古いGitソースの再デプロイは改修を上書きするため注意。
- 確認用にCLIが作成した保護バイパスは失効済み。公開後のエラーログ検索は0件。
- Vercelプラグインは接続済み。ただし`take9n`へのアクセスは追加のチーム認可が必要で、今回は認証済みCLIで公開作業を実施。
- 実行手順は`DEPLOY.md`。秘密の値をチャット・Git・ブラウザーコードに含めない。
- 既存SQLite/D1/旧Supabaseデータの移行は含まれない。

# 従来のSites公開状況（2026-09-20 JST）

## 完了

- 既存画面への永続API・認証・予約制約・申請承認処理の実装。
- ローカルSQLiteで7件の統合テストが成功。
- ローカルブラウザでログイン、個人予約の保存、両管理画面の表示を確認。
- Sitesの専用リポジトリへのソース送信とバージョン2の保存。

## 未完了

Sitesの公開処理は `incomplete input: SQLITE_ERROR` で失敗。稼働中の公開URLは未確認。

- Site: `appgprj_6aaccf6b60d481919b0d8b2c5ad99e11`
- Version 2: `appgprj_6aaccf6b60d481919b0d8b2c5ad99e11~appgver_7975c78b98988191b0da668760427192`
- Deployment: `appgdep_6aaef5a5ec4c81919abf1f33785cba90`
- Source commit: `4d6b80b6d74c176f7af579499a277d3e9b28d367`
- Version 1 deployment: `appgdep_6aaef3e7aa748191a690d7bdfe2a117c`（同じSQLエラー）

## 調査結果と再開条件

1. 初回のmanifest形式エラーは `d1: "DB"` に修正済み。
2. 改行問題を疑い、トリガーSQLのLFを保証したが解消しなかった。元ファイルもLFで、バージョン1・2の公開アーカイブの内容ハッシュは同一。改行が原因とは確認できていない。
3. `read_database_overview` はbindings・tablesとも空を返した。公開成功前のDB適用履歴はこのツールから確認できず、空のDBであることの証明にはならない。
4. SQLはローカルSQLiteで正しく実行される。Sites側のSQL分割処理などが候補だが未確定。

次に必要なのはSites側で失敗したSQL文・マイグレーション名と適用済み履歴を確認すること。適用済みファイルは変更せず、特定された未適用ファイルのみ修正する。同じアーカイブの再公開やSiteの作り直しは行わない。

既存Site IDを必ず再利用する。ローカルテストデータは `.local/` にのみあり、公開パッケージには含まれない。
