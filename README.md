# 軽音楽部 音楽室予約システム

Supabase をバックエンドにした、音楽室予約・バンド申請・運営管理用の Web アプリです。

## ファイル構成

- `index.html` - ポータルサイト
- `register.html` - 新規登録ページ
- `reservation.html` - 予約ページ
- `requests.html` - バンド作成・解散・メンバー変更申請ページ
- `admin.html` - 運営管理メニュー
- `admin/manage-member/index.html` - 予約管理
- `admin/manage-booking/index.html` - 部員・申請管理
- `app.js` - 画面制御、予約制約、ログイン、管理機能
- `styles.css` - 画面スタイル
- `supabase/schema.sql` - Supabase 用 SQL
- `sample-members.csv` - CSV取込サンプル

## 初期ログイン

- 管理者: `admin001` / `adminpass`

初期データは管理者のみです。部員は管理画面のCSVアップロードで追加してください。

## 管理ページ

- `/admin/manage-member/`
  - 予約制約
  - 使用可否編集
  - 月間利用状況

- `/admin/manage-booking/`
  - 部員検索
  - 折り畳み式の部員一覧
  - 申請一覧
  - 部員CSVアップロード

## 管理機能

- 部員検索で、所属バンド確認と管理者権限の付与・はく奪ができます。
- 申請フォームのメンバー情報は「学籍番号,氏名」または「学籍番号 氏名」の1行1名形式で検証されます。
- 現在から半年分の使用可否を、月・日・コマごとに編集できます。
- 曜日ごとのデフォルト開放コマを変更できます。
- 個別日のコマ設定は、曜日デフォルトより優先されます。

## CSV形式

```csv
student_id,name,role,password
admin001,軽音部運営,admin,adminpass
```

`role` は `member` または `admin` です。

## Supabase セットアップ

1. Supabase の SQL Editor を開く
2. `supabase/schema.sql` の内容を実行する
3. `app.js` の `SUPABASE_URL` と `SUPABASE_ANON_KEY` を設定する

## 注意

現在のSQLは試作・部内運用の初期確認用に、匿名キーから読み書きできるRLSにしています。また、パスワードも動作確認しやすいよう平文カラムです。公開運用では Supabase Auth またはサーバー側処理を導入し、パスワードをハッシュ化し、管理操作を認証済み管理者だけに制限してください。
