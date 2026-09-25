const progressLabels: Record<string, string> = {
    fetching: "フェッチ中",
    pulling: "プル中",
    pushing: "プッシュ中",
    cloning: "複製中",
    checkout: "ブランチを切り替え中",
    "checking out": "ブランチを切り替え中",
    working: "処理中",
    counting: "オブジェクトを集計中",
    "counting objects": "オブジェクトを集計中",
    compressing: "オブジェクトを圧縮中",
    "compressing objects": "オブジェクトを圧縮中",
    receiving: "オブジェクトを受信中",
    "receiving objects": "オブジェクトを受信中",
    writing: "オブジェクトを書き込み中",
    "writing objects": "オブジェクトを書き込み中",
    resolving: "差分を処理中",
    "resolving deltas": "差分を処理中",
    "updating workdir": "作業ディレクトリーを更新中",
    "analyzing workdir": "作業ディレクトリーを解析中",
};

// Translate only display text; operation names still drive progress icons.
export function gitProgressText(value: string): string {
    return progressLabels[value.toLowerCase()] ?? value;
}
