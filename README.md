# Practice Kit

吹奏楽・管楽器の練習用 PWA。メトロノーム・チューナー・ハーモニー(鍵盤+ダイアトニックコード学習)の3アプリをタブで切り替える。
ビルド不要の静的サイト。マイク・Wake Lock・PWA は https か localhost でのみ動作。

## 構成と権利

| フォルダ | 内容 | 権利 |
|---|---|---|
| `index.html` `sw.js` `manifest.json` `shell/` | タブ切替・設定・PWA のシェル | © 2026 Kyohei Kobayashi(自作) |
| `harmony/` | Harmony Pad: 鍵盤、純正律/平均律、コード判定、調ごとのダイアトニックコード、コード進行プレイヤー、聴き取りクイズ | © 2026 Kyohei Kobayashi(自作) |
| `tuner/` | クロマチックチューナー(YIN)、記録、音程チェック | © 2026 Kyohei Kobayashi(自作) |
| `metronome/` | **NamaMeto** by nama(Nama Studio) | 原作者の「改造・再配布について」の条件に従い無改変で収録(名前を残す・原作リンクを表示)。原作: https://nama1223.com/NamaSoundPlus/?openExternalBrowser=1 |

`harmony/` `tuner/` とシェルは、既存アプリの機能(アイデア)を参考に **ソースを見ずにゼロから書いた** もの。
音はすべて Web Audio API で合成しており、音声ファイルは含まない。

## ローカルで動かす

```bash
python -m http.server 8765 --bind 127.0.0.1
```

を `practice-kit` の1つ上のフォルダで起動し http://localhost:8765/practice-kit/ を開く。

## 公開

GitHub Pages(`main` ブランチ / ルート)。サブパス配下でも動くよう、すべて相対パスで書いてある。

## 子アプリとシェルの連携

シェル → 子: `postMessage({type:'setLanguage'|'setWakeLock'|'pauseAll', ...}, location.origin)`
子 → シェル: 読み込み完了時に `{type:'childReady', app}`。同一オリジンのみ受け付ける。
