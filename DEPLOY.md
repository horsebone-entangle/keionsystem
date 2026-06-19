# Vercel 公開手順

## 1. Supabase 設定

1. Supabase の Project Settings > API を開く。
2. `Project URL` を `config.js` の `SUPABASE_URL` に入れる。
3. `anon public` key を `SUPABASE_ANON_KEY` に入れる。

`service_role` key は絶対に入れないでください。ブラウザから見えるため危険です。

## 2. GitHub から公開する場合

1. このフォルダを GitHub リポジトリに push する。
2. Vercel で Add New > Project を選ぶ。
3. 対象リポジトリを Import する。
4. Framework Preset は `Other` のままでよい。
5. Build Command は空、Output Directory も空のまま Deploy する。

## 3. Vercel CLI から公開する場合

```powershell
npm i -g vercel
vercel login
vercel --prod
```

質問されたら、基本は以下で進めます。

- Set up and deploy: `Y`
- Which scope: 自分のアカウントまたは部活用チーム
- Link to existing project: 初回は `N`
- Project name: `keion-booking` など
- Directory: `./`
- Build Command: 空
- Output Directory: 空

## 4. 公開後に確認するURL

- `/`
- `/reservation`
- `/requests`
- `/admin/manage-member`
- `/admin/manage-booking`

管理画面は、管理者権限を持つ部員でポータルにログインしたときだけ表示されます。
