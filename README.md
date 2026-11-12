# binette-apps

[Binette](https://github.com/nozomi-hiragi/binette) のアプリと、その提供リストを置くリポジトリです。

提供リスト: https://nozomi-hiragi.github.io/binette-apps/

この URL は今後も固定です。Binette の「アプリ」→「リスト」に追加すると、公開済みのアプリをインストールできます。現在は Décor の部品を編集する「デザイナー」を収録しています。Binette 本体のドキュメントアプリは本体側で管理します。移行前のデザイナーのデータは引き継ぎません。

## 開発

Deno 2.9.7 以降、Git、tar を使います。

```sh
deno task setup
deno task check
deno task test
deno task catalog /tmp/binette-apps-site
```

`check` は型検査と lint、`test` はデザイナーの AssemblyScript/Wasm テストと、一時 Git リポジトリを使った提供リストのテストを実行します。`catalog` は指定先に `index.html` と `apps.json` を生成します。アプリ本体はコピーせず、タグのコミットに固定した GitHub の raw URL を参照します。

対象の Binette は [`binette.json`](binette.json) のタグで一元管理します。`setup` はそのタグを `--depth 1 --branch <tag>` で `.binette/` に取得します。既存の取得先が違うタグや変更済みの内容なら失敗するため、必要な変更を保管して `.binette/` を取り除いてから再実行してください。

型検査の `jsr:@binette/replique` と `/ui` は `.binette/packages/replique` に解決します。Réplique の機能パッケージも取得先の Deno ワークスペースを使います。JSR の別版と混ざらないよう、ビルドと提供リストのメタデータ生成も同じタグの `packages/regie/src/build.ts`、`cli.ts`、`packages/replique` を使います。AssemblyScript は Binette と同じ版を使います。

## アプリの追加

1. リポジトリ直下にアプリのフォルダを作り、`app.json`、ソース、必要なアイコンやテストを置きます。`designer/` が例です。`app.json` の `id` はリポジトリ内で一意にし、`version` は SemVer 形式にします。
2. 必要な Deno ワークスペース、型検査・テスト対象をルートの `deno.json` に追加します。AssemblyScript と Deno のテストは別の設定にします。
3. 上記の setup・check・test を通します。リリースタグのないアプリは提供リストに載りません。

## リリース

1. アプリの `app.json` の `version` を上げ、変更を main にマージします。
2. その変更を含むコミットに `<app id>/v<version>` タグを付けて push します。初回のデザイナーなら次の形式です。

   ```sh
   git tag designer/v0.1.0
   git push origin designer/v0.1.0
   ```

3. Pages workflow が全タグを取得し、各アプリの最大 SemVer を公開します。GitHub の Settings → Pages で公開元を GitHub Actions に設定してください。`workflow_dispatch` でも再生成できます。

リリースタグは一度公開したら移動・削除しません。修正は必ず新しいバージョンとタグで公開します。最大 SemVer は作成日時や文字列順ではなく、プレリリースも含む SemVer の優先順位で決めます。同順位の build metadata 付きタグはタグ名の昇順で最初のものを使うため、同順位の別リリースは作らないでください。

生成時は選ばれたタグのコミットをリポジトリ外の一時フォルダへ展開し、その中の `app.json` の ID とバージョンを検査します。不一致なら公開を失敗させます。`source`、バージョン、`integrity["/"]`、`requires` はすべてそのリリースに対応し、作業中のソースは混ざりません。HTML の `link rel="binette-apps"` と埋め込み JSON は `apps.json` と同じ内容です。

Pages は main の生成スクリプトで全リリースをまとめ、同時に複数の公開を走らせません。単一の提供リストを共有するので、アプリごとのリリースでも他のアプリは残ります。
