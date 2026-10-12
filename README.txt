Sky Survivor — AFTERBURN

HTML・JavaScript・CSS・Three.jsを同梱したゲーム一式です。音声はすべてWeb Audioで生成しており、音声ファイルは不要です。

PCで起動する方法（Python 3がある場合）
1. ZIPを展開します。
2. 展開したフォルダーで次を実行します。
   python -m http.server 8000
3. ブラウザで http://localhost:8000 を開きます。

JavaScriptモジュールを使用するため、index.htmlの直接ダブルクリックでは動作しないことがあります。
Webサイトに配置する場合は、このフォルダー全体をアップロードしてください。
iPhoneでは公開URLをSafariで開いてプレイしてください。
https://sky-survivor-afterburn.cuichunxue1984.chatgpt.site

操作
左スティック：操縦／右：加速長押し・フレア
PC：WASDまたは矢印キー、Shiftで加速、Spaceでフレア、C 視点、M 音、P/Esc 一時停止
リザルト画面：Enter / Space / R ですぐ再出撃
ゲームパッド：左スティック操縦、A フレア、RT/RB/B 加速、Y 視点、START 一時停止
音あり（初期設定）・音なしは出撃前に選択でき、選択は保存されます。
一時停止画面で揺れを控えめにできます（スローモーションや画面揺れも抑えます）。

遊び方のポイント
・リングを連続で通すとコンボ倍率（最大×4）。4本に1本の金リングは大きなボーナスとエネルギー全回復。
・海面すれすれ（高度55m未満）を飛ぶと低空ボーナス。ただし海面接触に注意。
・フレアで誘導を外したミサイルは空中で爆発し SPLASH ボーナス。
・ミサイルとすれ違うと CLOSE CALL。画面端の矢印で接近方向と距離が分かります。
・スコアでランク S / A / B / C / D を判定。

ファイル構成
index.html / style.css … 画面とHUD
game.js  … ゲーム本体（飛行・戦闘・カメラ・HUD）
audio.js … BGM（展開に応じて変化）とエンジン音・効果音の合成
fx.js    … パーティクル・衝撃波・雲テクスチャ
flight.js … 共通の計算関数
JOURNEY_MAP.md … プレイヤージャーニーマップと改善方針

同梱のThree.jsのライセンスはvendor/LICENSEを参照してください。
