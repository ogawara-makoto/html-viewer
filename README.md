# HTML ビューアー

iPhone・iPad で、手元の HTML ファイルを CSS と JavaScript ごと表示するための小さな Web アプリ（PWA）。

- 使い方: Safari で開き、共有 →「ホーム画面に追加」。右上の ＋ から HTML ファイルを選ぶ。
- 開いたファイルは端末の中（IndexedDB）にだけ保存し、どこにも送らない。最近の 30 件を一覧に残す。
- 一覧はページの題で並べ、返事を返すページ（ペンのアイコン）を上にまとめる。右上のボタンで明るい／暗いを切り替える（表示中のページにも伝える）。
- 返事を返すページが `postMessage`（`html-viewer:answer`）で返事を渡すと、上の帯から `<ファイル名>.answer.txt` として共有シートで保存できる。
- 表示は `sandbox` 付きの iframe（`allow-same-origin` なし）で、表示した HTML のスクリプトはビューアーの保存領域に触れない。
- 依存なし・ビルドなし。`index.html`・`app.js`・`sw.js`・`manifest.webmanifest`・アイコンだけ。
- 検索エンジンに載せない印（`<meta name="robots" content="noindex, nofollow">`）を入れている。
- 本体を直したら `sw.js` の `VERSION` を上げる。

制限: 1 ファイルで完結する HTML 向け。別ファイルの画像や CSS を相対パスで参照するページは、その部分が表示されない。
