# mozi · Whisper 音声文字起こし

Whisper（Base / Small / Large v3 Turbo / 言語特化 を選択、既定は Small）を Transformers.js 3.8.1 でブラウザー内実行するサイトです。WebGPU 対応ブラウザーでは WebGPU、非対応または失敗時は WebAssembly（WASM）で動作します。APIキー、PythonのWhisper、サーバーの音声処理は不要です。

## 起動手順

1. Python 3 と Node.js 22 以降をインストールします（Node.js はテスト用）。
2. このディレクトリで `npm run dev` を実行します。
3. `http://127.0.0.1:3000` を開きます。
4. 50 MB・20分以内の音声を選択し、言語を指定して「文字起こしを開始」を押します。
5. 初回はインターネット経由でモデルとWASMランタイムを取得します。短い音声から試してください。
6. 結果を修正し、コピーまたはTXT保存を選びます。ページを閉じると音声と結果は失われます。

外部のAPIキー設定はありません。静的ホスティングに `dist` の内容を配置できます。localhost以外ではHTTPSを利用してください。Chrome/Edgeの最新版を推奨します。形式の読み込み可否はブラウザーのコーデック対応によります。

## 仕組み・制約

- オーディオをデコードし、チャンネルを平均して16 kHzのモノラルへリサンプリング。
- 専用Web Workerで30秒チャンク・5秒ストライドによる認識。タイムスタンプを有効にしてチャンク境界の結合精度を高め、取りこぼしを減らします。
- モデル: Base / Small は多言語版、言語が英語のときは英語専用の `.en` 版を自動選択。Large v3 Turbo は WebGPU 必須（WASM では選択不可）。エンコーダーは fp32（Turbo のWebGPUは fp16）、デコーダーは WASM が q8、WebGPU が q4。UIをブロックしません。
- 言語特化: WebGPU 必須、約1.5 GB（WASM では選択不可）。エンコーダー fp16・デコーダー q4。言語ごとに次のモデルを使い、それ以外（英語・フランス語・スペイン語・自動検出）は `onnx-community/whisper-large-v3-turbo`。
  - 日本語: `onnx-community/kotoba-whisper-v2.2-ONNX`
  - 中国語: `subtitleking/belle-whisper-large-v3-turbo-zh-onnx`（コミット `b5233598ee23522e477a67d168ee60e2f3068d38` に固定）
  - 韓国語: `JaeyeongYang/whisper-large-v3-turbo-korean-onnx`（コミット `0544cc0ef462c6feaad6131a8dba634a3a6e1a37` に固定）
  - ドイツ語: `flackzz/whisper-large-v3-turbo-german-ONNX`（コミット `33cc57e9f096f55e198a41db98844d1d341a58de` に固定）
  - 第三者のリポジトリーはコミット固定で、後からの差し替えの影響を受けません。onnx-community のモデルは `main` を参照します。
- キャンセル時はWorkerを終了。終了したジョブの結果は適用しません。
- ファイル名、音声、認識結果をログやサーバーへ送信しません。結果はtextContent/textareaで扱い、HTMLとして解釈しません。
- jsDelivrからライブラリー・ランタイム、Hugging Faceからモデルを取得します。モデルのダウンロードはブラウザーキャッシュを利用します。音声・結果の履歴保存はありません。
- Base は軽量なため、雑音、日本語や固有名詞の認識には誤りが出ることがあります。端末によって長い音声の処理には時間・メモリーを要します。
- `npm test` でファイル検証、時間上限、ステレオ変換、保存名の単体テストを実行します。

参考: https://huggingface.co/docs/transformers.js/pipelines
モデル: https://huggingface.co/onnx-community/whisper-small
