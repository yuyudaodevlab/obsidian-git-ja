import type { App } from "obsidian";
import { Modal } from "obsidian";

export type DiscardResult = false | "delete" | "discard";

export class DiscardModal extends Modal {
    path: string;
    deleteCount: number;
    discardCount: number;
    constructor({
        app,
        path,
        filesToDeleteCount,
        filesToDiscardCount,
    }: {
        app: App;
        path: string;
        filesToDeleteCount: number;
        filesToDiscardCount: number;
    }) {
        super(app);
        this.path = path;
        this.deleteCount = filesToDeleteCount;
        this.discardCount = filesToDiscardCount;
    }
    resolve: ((value: DiscardResult) => void) | null = null;

    /**
     * @returns the result of the modal, whcih can be:
     *   - `false` if the user canceled the modal
     *   - `"delete"` if the user chose to delete all files. In case there are also tracked files, they will be discarded as well.
     *   - `"discard"` if the user chose to discard all tracked files. Untracked files will not be deleted.
     */
    openAndGetResult(): Promise<DiscardResult> {
        this.open();
        return new Promise<DiscardResult>((resolve) => {
            this.resolve = resolve;
        });
    }

    onOpen() {
        const sum = this.deleteCount + this.discardCount;
        const { contentEl, titleEl } = this;
        let titlePart = "すべてのファイル";
        if (this.path != "") {
            if (sum > 1) {
                titlePart = `「${this.path}」内のファイル`;
            } else {
                titlePart = `「${this.path}」`;
            }
        }
        titleEl.setText(
            `${titlePart}${this.discardCount == 0 ? "を削除" : "の変更を破棄"}`
        );
        if (this.deleteCount > 0) {
            contentEl
                .createEl("p")
                .setText(
                    `未追跡の「${this.deleteCount}」ファイルを削除しますか？Obsidianの削除設定に従って削除します。`
                );
        }
        if (this.discardCount > 0) {
            contentEl
                .createEl("p")
                .setText(
                    `追跡済みの「${this.discardCount}」ファイルの変更をすべて破棄しますか？`
                );
        }
        const div = contentEl.createDiv({ cls: "modal-button-container" });

        if (this.deleteCount > 0) {
            const discardAndDelete = div.createEl("button", {
                cls: "mod-warning",
                text: `「${sum}」ファイル${this.discardCount > 0 ? "の変更を破棄し、未追跡ファイルを削除" : "をすべて削除"}`,
            });
            discardAndDelete.addEventListener("click", () => {
                if (this.resolve) this.resolve("delete");
                this.close();
            });
            discardAndDelete.addEventListener("keypress", () => {
                if (this.resolve) this.resolve("delete");
                this.close();
            });
        }

        if (this.discardCount > 0) {
            const discard = div.createEl("button", {
                cls: "mod-warning",
                text: `追跡済みの「${this.discardCount}」ファイルの変更をすべて破棄`,
            });
            discard.addEventListener("click", () => {
                if (this.resolve) this.resolve("discard");
                this.close();
            });
            discard.addEventListener("keypress", () => {
                if (this.resolve) this.resolve("discard");
                this.close();
            });
        }

        const close = div.createEl("button", {
            text: "キャンセル",
        });
        close.addEventListener("click", () => {
            if (this.resolve) this.resolve(false);
            return this.close();
        });
        close.addEventListener("keypress", () => {
            if (this.resolve) this.resolve(false);
            return this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
