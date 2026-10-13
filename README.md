# Web制作管理（仮）

Web制作の「サイトマップ・制作フェーズ・クライアント確認」を1か所で管理するアプリ。
React（Vite + TypeScript）＋ Supabase（DB・Googleログイン）。公開は Firebase Hosting を予定。

現在の範囲（v0.1の途中）: Googleログイン、案件一覧、案件の作成。サイトマップ画面は次のステップ。

## セットアップ

### 1. Supabase プロジェクトを作る
[Supabase](https://supabase.com/dashboard) で新しいプロジェクトを作成する。

### 2. テーブルを作る
Supabase の **SQL Editor** を開き、`supabase/migrations/20261013000000_v01_core.sql` の中身を貼り付けて実行する。

### 3. Google ログインを設定する
1. [Google Cloud Console](https://console.cloud.google.com/) の **Google Auth Platform → Clients** で、種類 **Web application** のOAuthクライアントIDを作る。
   - **Authorized JavaScript origins**: `http://localhost:5173`（本番公開時は本番のURLも追加）
   - **Authorized redirect URIs**: Supabase の Google プロバイダ設定ページに表示される **Callback URL**
     （`https://<プロジェクトID>.supabase.co/auth/v1/callback` の形）
   - 作成後に表示される **Client ID** と **Client Secret** を控える。
2. 同じ Google Auth Platform の **Data Access（Scopes）** に `openid` を追加する（`email` と `profile` は最初から入っている）。
3. Supabase Dashboard の **Authentication → Providers → Google** を開き、Google を有効にして Client ID と Client Secret を入れて保存する。
4. Supabase Dashboard の **Authentication → URL Configuration** で、
   **Site URL** を `http://localhost:5173` にし、**Redirect URLs** にも `http://localhost:5173` を追加する。
   （公式ドキュメントに具体的な値の記載がないため、ログイン後に戻れないときはまずここを確認する）

### 4. 環境変数を設定する
```
cp .env.example .env
```
`.env` に、Supabase の **Project Settings → API Keys** にある Project URL と publishable key（従来の anon key でも可）を入れる。

> `service_role` キーは絶対に入れない（画面のコードに入れると誰でも全データを読めてしまう）。
> publishable / anon キーは公開されても、SQLで設定した行レベルセキュリティ(RLS)がデータを守る。

### 5. 起動する
```
npm install
npm run dev
```
http://localhost:5173 を開き、「Googleでログイン」を押す。

## 動作確認のしかた
- ログイン後、「＋ 案件を作成」で案件を作ると、一覧にカードが出る。
- 作成時に、制作フェーズ5つと確認ポイント3つが自動で入る（Supabase の Table Editor で `phases` / `confirmation_points` を見て確認できる）。
- 別のGoogleアカウントでログインすると、最初のアカウントの案件は見えない。

## フォルダ構成
```
src/
  lib/supabase.ts          Supabase接続
  auth/AuthContext.tsx     ログイン状態・Googleログイン・ログアウト
  pages/Login.tsx          ログイン画面
  pages/Projects.tsx       案件一覧
  pages/ProjectPage.tsx    案件の詳細（サイトマップ）。これから作る
  components/              ヘッダー、案件カード、案件作成ダイアログ
supabase/migrations/       テーブル定義（SQL）
```

## 次にやること
1. サイトマップ画面（ページの追加・親子・並び替え、フェーズ変更、確認状況）
2. Firebase Hosting への公開（本番URLを Google と Supabase の設定に追加する）
