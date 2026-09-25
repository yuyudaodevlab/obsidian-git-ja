import { FuzzySuggestModal } from "obsidian";
import type ObsidianGit from "src/main";
import type { FileStatusResult } from "src/types";

export class ChangedFilesModal extends FuzzySuggestModal<FileStatusResult> {
    plugin: ObsidianGit;
    changedFiles: FileStatusResult[];

    constructor(plugin: ObsidianGit, changedFiles: FileStatusResult[]) {
        super(plugin.app);
        this.plugin = plugin;
        this.changedFiles = changedFiles;
        this.setPlaceholder("未対応のファイルは既定のアプリで開く。");
    }

    getItems(): FileStatusResult[] {
        return this.changedFiles;
    }

    getItemText(item: FileStatusResult): string {
        if (item.index == "U" && item.workingDir == "U") {
            return `未追跡 | ${item.vaultPath}`;
        }

        let workingDir = "";
        let index = "";

        if (item.workingDir != " ")
            workingDir = `作業ディレクトリー： ${item.workingDir} `;
        if (item.index != " ") index = `インデックス： ${item.index}`;

        return `${workingDir}${index} | ${item.vaultPath}`;
    }

    onChooseItem(item: FileStatusResult, _: MouseEvent | KeyboardEvent): void {
        if (
            this.plugin.app.metadataCache.getFirstLinkpathDest(
                item.vaultPath,
                ""
            ) == null
        ) {
            this.app.openWithDefaultApp(item.vaultPath);
        } else {
            void this.plugin.app.workspace.openLinkText(item.vaultPath, "/");
        }
    }
}
