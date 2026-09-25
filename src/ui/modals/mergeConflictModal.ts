import { Modal } from "obsidian";
import type ObsidianGit from "src/main";

export class MergeConflictModal extends Modal {
    constructor(private readonly plugin: ObsidianGit) {
        super(plugin.app);
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        const conflicts = this.plugin.cachedStatus?.conflicted ?? [];

        titleEl.setText("マージ中");
        contentEl.addClass("obsidian-git-merge-help");
        contentEl.createEl("p", {
            text: "Gitが保管庫の内容と別のバージョンの変更を統合しています。プッシュや自動コミットの再開には、マージのコミットが必要です。",
        });

        if (conflicts.length > 0) {
            contentEl.createEl("h3", { text: "競合を解決" });
            contentEl.createEl("p", {
                text: "自動で統合できない箇所があります。競合している各ファイルを開き、強調表示されたすべての競合箇所を確認してください。",
            });

            const steps = contentEl.createEl("ol");
            steps.createEl("li", {
                text: "ローカルの内容を使うなら「ローカルを採用」、取り込む内容を使うなら「取り込む変更を採用」、両方なら「両方を残す」を選びます。直接編集することもできます。",
            });
            steps.createEl("li", {
                text: "ファイルの競合数が0になったら、横のプラスアイコンを選んで解決済みにします。",
            });
            steps.createEl("li", {
                text: "「競合」にあるすべてのファイルで同じ操作を繰り返します。",
            });
        } else {
            const resolved = contentEl.createDiv({
                cls: "obsidian-git-merge-help-resolved",
            });
            resolved.createEl("strong", {
                text: "すべての競合が解決済みになりました。",
            });
            resolved.createEl("div", {
                text: "ステージ済みの変更をコミットするまで、マージは完了しません。",
            });
        }

        contentEl.createEl("h3", { text: "マージを完了" });
        contentEl.createEl("p", {
            text: "「競合」が空になったら、メッセージを入力してステージ済みの変更をコミットします。これでマージが完了します。その後、通常どおりプッシュできます。",
        });

        const buttons = contentEl.createDiv({ cls: "modal-button-container" });
        const close = buttons.createEl("button", {
            cls: "mod-cta",
            text: "閉じる",
        });
        close.addEventListener("click", () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
