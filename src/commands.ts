import { Notice, TFolder, WorkspaceLeaf } from "obsidian";
import { HISTORY_VIEW_CONFIG, SOURCE_CONTROL_VIEW_CONFIG } from "./constants";
import { SimpleGit } from "./gitManager/simpleGit";
import ObsidianGit from "./main";
import { openHistoryInGitHub, openLineInGitHub } from "./openInGitHub";
import { ChangedFilesModal } from "./ui/modals/changedFilesModal";
import { GeneralModal } from "./ui/modals/generalModal";
import { IgnoreModal } from "./ui/modals/ignoreModal";
import { assertNever } from "./utils";
import { togglePreviewHunk } from "./editor/signs/tooltip";

export function addCommmands(plugin: ObsidianGit) {
    const app = plugin.app;

    plugin.addCommand({
        id: "edit-gitignore",
        name: ".gitignoreを編集",
        callback: async () => {
            const path = plugin.gitManager.getRelativeVaultPath(".gitignore");
            if (!(await app.vault.adapter.exists(path))) {
                await app.vault.adapter.write(path, "");
            }
            const content = await app.vault.adapter.read(path);
            const modal = new IgnoreModal(app, content);
            const res = await modal.openAndGetReslt();
            if (res !== undefined) {
                await app.vault.adapter.write(path, res);
                await plugin.refresh();
            }
        },
    });
    plugin.addCommand({
        id: "open-git-view",
        name: "ソース管理ビューを開く",
        callback: async () => {
            const leafs = app.workspace.getLeavesOfType(
                SOURCE_CONTROL_VIEW_CONFIG.type
            );
            let leaf: WorkspaceLeaf;
            if (leafs.length === 0) {
                leaf =
                    app.workspace.getRightLeaf(false) ??
                    app.workspace.getLeaf();
                await leaf.setViewState({
                    type: SOURCE_CONTROL_VIEW_CONFIG.type,
                });
            } else {
                leaf = leafs.first()!;
            }
            await app.workspace.revealLeaf(leaf);

            // Is not needed for the first open, but allows to refresh the view
            // per hotkey even if already opened
            app.workspace.trigger("obsidian-git:refresh");
        },
    });
    plugin.addCommand({
        id: "open-history-view",
        name: "履歴ビューを開く",
        callback: async () => {
            const leafs = app.workspace.getLeavesOfType(
                HISTORY_VIEW_CONFIG.type
            );
            let leaf: WorkspaceLeaf;
            if (leafs.length === 0) {
                leaf =
                    app.workspace.getRightLeaf(false) ??
                    app.workspace.getLeaf();
                await leaf.setViewState({
                    type: HISTORY_VIEW_CONFIG.type,
                });
            } else {
                leaf = leafs.first()!;
            }
            await app.workspace.revealLeaf(leaf);

            // Is not needed for the first open, but allows to refresh the view
            // per hotkey even if already opened
            app.workspace.trigger("obsidian-git:refresh");
        },
    });

    plugin.addCommand({
        id: "open-diff-view",
        name: "差分ビューを開く",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null;
            } else {
                const filePath = plugin.gitManager.getRelativeRepoPath(
                    file!.path,
                    true
                );
                plugin.tools.openDiff({
                    aFile: filePath,
                    aRef: "",
                });
                return true;
            }
        },
    });

    plugin.addCommand({
        id: "view-file-on-github",
        name: "GitHubでファイルを開く",
        editorCallback: (editor, { file }) => {
            if (file) return openLineInGitHub(editor, file, plugin.gitManager);
            return undefined;
        },
    });

    plugin.addCommand({
        id: "view-history-on-github",
        name: "GitHubでファイルの履歴を開く",
        editorCallback: (_, { file }) => {
            if (file) return openHistoryInGitHub(file, plugin.gitManager);
            return undefined;
        },
    });

    plugin.addCommand({
        id: "pull",
        name: "プル",
        callback: () =>
            plugin.promiseQueue.addTask(() => plugin.pullChangesFromRemote()),
    });

    plugin.addCommand({
        id: "fetch",
        name: "フェッチ",
        callback: () => plugin.promiseQueue.addTask(() => plugin.fetch()),
    });

    plugin.addCommand({
        id: "switch-to-remote-branch",
        name: "リモートブランチに切り替える",
        callback: () =>
            plugin.promiseQueue.addTask(() => plugin.switchRemoteBranch()),
    });

    plugin.addCommand({
        id: "add-to-gitignore",
        name: "ファイルを.gitignoreに追加",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null;
            } else {
                plugin
                    .addFileToGitignore(file!.path, file instanceof TFolder)
                    .catch((e) => plugin.displayError(e));
                return true;
            }
        },
    });

    plugin.addCommand({
        id: "push",
        name: "コミットと同期",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commitAndSync({ fromAutoBackup: false })
            ),
    });

    plugin.addCommand({
        id: "backup-and-close",
        name: "コミットと同期を実行してObsidianを閉じる",
        callback: () =>
            plugin.promiseQueue.addTask(async () => {
                await plugin.commitAndSync({ fromAutoBackup: false });
                window.close();
            }),
    });

    plugin.addCommand({
        id: "commit-push-specified-message",
        name: "メッセージを指定してコミットと同期",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commitAndSync({
                    fromAutoBackup: false,
                    requestCustomMessage: true,
                })
            ),
    });

    plugin.addCommand({
        id: "commit",
        name: "すべての変更をコミット",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commit({ fromAuto: false, mode: "all" })
            ),
    });

    plugin.addCommand({
        id: "commit-specified-message",
        name: "メッセージを指定してすべての変更をコミット",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commit({
                    fromAuto: false,
                    requestCustomMessage: true,
                    mode: "all",
                })
            ),
    });

    plugin.addCommand({
        id: "commit-smart",
        name: "コミット",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commit({
                    fromAuto: false,
                    requestCustomMessage: false,
                    mode: "smart",
                })
            ),
    });

    plugin.addCommand({
        id: "commit-staged",
        name: "ステージ済みの変更をコミット",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commit({
                    fromAuto: false,
                    requestCustomMessage: false,
                    mode: "staged",
                })
            ),
    });

    plugin.addCommand({
        id: "commit-amend-staged-specified-message",
        name: "ステージ済みの変更で直前のコミットを修正",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commit({
                    fromAuto: false,
                    requestCustomMessage: true,
                    mode: "staged",
                    amend: true,
                })
            ),
    });

    plugin.addCommand({
        id: "commit-smart-specified-message",
        name: "メッセージを指定してコミット",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commit({
                    fromAuto: false,
                    requestCustomMessage: true,
                    mode: "smart",
                })
            ),
    });

    plugin.addCommand({
        id: "commit-staged-specified-message",
        name: "メッセージを指定してステージ済みの変更をコミット",
        callback: () =>
            plugin.promiseQueue.addTask(() =>
                plugin.commit({
                    fromAuto: false,
                    requestCustomMessage: true,
                    mode: "staged",
                })
            ),
    });

    plugin.addCommand({
        id: "push2",
        name: "プッシュ",
        callback: () => plugin.promiseQueue.addTask(() => plugin.push()),
    });

    plugin.addCommand({
        id: "stage-current-file",
        name: "現在のファイルをステージ",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null;
            } else {
                plugin.promiseQueue.addTask(() => plugin.stageFile(file!));
                return true;
            }
        },
    });

    plugin.addCommand({
        id: "unstage-current-file",
        name: "現在のファイルのステージを解除",
        checkCallback: (checking) => {
            const file = app.workspace.getActiveFile();
            if (checking) {
                return file !== null;
            } else {
                plugin.promiseQueue.addTask(() => plugin.unstageFile(file!));
                return true;
            }
        },
    });

    plugin.addCommand({
        id: "edit-remotes",
        name: "リモートを編集",
        callback: () =>
            plugin.editRemotes().catch((e) => plugin.displayError(e)),
    });

    plugin.addCommand({
        id: "remove-remote",
        name: "リモートを削除",
        callback: () =>
            plugin.removeRemote().catch((e) => plugin.displayError(e)),
    });

    plugin.addCommand({
        id: "set-upstream-branch",
        name: "上流ブランチを設定",
        callback: () =>
            plugin.setUpstreamBranch().catch((e) => plugin.displayError(e)),
    });

    plugin.addCommand({
        id: "delete-repo",
        name: "注意：リポジトリーを削除",
        callback: async () => {
            const repoExists = await app.vault.adapter.exists(
                `${plugin.settings.basePath}/.git`
            );
            if (repoExists) {
                const modal = new GeneralModal(plugin, {
                    options: ["いいえ", "はい"],
                    placeholder:
                        "リポジトリー（.gitディレクトリー）を削除しますか？この操作は取り消せません。",
                    onlySelection: true,
                });
                const shouldDelete =
                    (await modal.openAndGetResult()) === "はい";
                if (shouldDelete) {
                    await app.vault.adapter.rmdir(
                        `${plugin.settings.basePath}/.git`,
                        true
                    );
                    new Notice(
                        "リポジトリーを削除しました。プラグインを再読み込み中…"
                    );
                    plugin.unloadPlugin();
                    await plugin.init({ fromReload: true });
                }
            } else {
                new Notice("リポジトリーが見つからない。");
            }
        },
    });

    plugin.addCommand({
        id: "init-repo",
        name: "新しいリポジトリーを初期化",
        callback: () =>
            plugin.createNewRepo().catch((e) => plugin.displayError(e)),
    });

    plugin.addCommand({
        id: "clone-repo",
        name: "リモートリポジトリーを複製",
        callback: () =>
            plugin.cloneNewRepo().catch((e) => plugin.displayError(e)),
    });

    plugin.addCommand({
        id: "list-changed-files",
        name: "変更ファイルの一覧を表示",
        callback: async () => {
            if (!(await plugin.isAllInitialized())) return;

            try {
                const status = await plugin.updateCachedStatus();
                if (status.changed.length + status.staged.length > 500) {
                    plugin.displayError("変更が多すぎるため表示できない。");
                    return;
                }

                new ChangedFilesModal(plugin, status.all).open();
            } catch (e) {
                plugin.displayError(e);
            }
        },
    });

    plugin.addCommand({
        id: "switch-branch",
        name: "ブランチを切り替える",
        callback: () => {
            plugin.switchBranch().catch((e) => plugin.displayError(e));
        },
    });

    plugin.addCommand({
        id: "create-branch",
        name: "新しいブランチを作成",
        callback: () => {
            plugin.createBranch().catch((e) => plugin.displayError(e));
        },
    });

    plugin.addCommand({
        id: "delete-branch",
        name: "ブランチを削除",
        callback: () => {
            plugin.deleteBranch().catch((e) => plugin.displayError(e));
        },
    });

    plugin.addCommand({
        id: "discard-all",
        name: "注意：すべての変更を破棄",
        callback: async () => {
            const res = await plugin.discardAll();
            switch (res) {
                case "discard":
                    new Notice("追跡済みファイルのすべての変更を破棄した。");
                    break;
                case "delete":
                    new Notice(
                        "すべてのファイルの変更を破棄し、未追跡ファイルを削除した。"
                    );
                    break;
                case false:
                    break;
                default:
                    assertNever(res);
            }
        },
    });

    plugin.addCommand({
        id: "pause-automatic-routines",
        name: "自動処理を一時停止／再開",
        callback: () => {
            const pause = !plugin.localStorage.getPausedAutomatics();
            plugin.localStorage.setPausedAutomatics(pause);
            if (pause) {
                plugin.automaticsManager.unload();
                new Notice(`自動処理を一時停止した。`);
            } else {
                plugin.automaticsManager.reload("commit", "push", "pull");
                new Notice(`自動処理を再開した。`);
            }
        },
    });

    plugin.addCommand({
        id: "raw-command",
        name: "Gitコマンドを直接実行",
        checkCallback: (checking) => {
            const gitManager = plugin.gitManager;
            if (checking) {
                // only available on desktop
                return gitManager instanceof SimpleGit;
            } else {
                plugin.tools
                    .runRawCommand()
                    .catch((e) => plugin.displayError(e));
                return true;
            }
        },
    });

    plugin.addCommand({
        id: "toggle-line-author-info",
        name: "行ごとの作成者情報の表示を切り替える",
        callback: () =>
            plugin.settingsTab?.configureLineAuthorShowStatus(
                !plugin.settings.lineAuthor.show
            ),
    });

    plugin.addCommand({
        id: "reset-hunk",
        name: "変更ブロックを破棄",
        editorCheckCallback(checking, _, __) {
            if (checking) {
                return (
                    plugin.settings.hunks.hunkCommands &&
                    plugin.hunkActions.editor !== undefined
                );
            }

            plugin.hunkActions.resetHunk();
            return true;
        },
    });

    plugin.addCommand({
        id: "stage-hunk",
        name: "変更ブロックをステージ",
        editorCheckCallback: (checking, _, __) => {
            if (checking) {
                return (
                    plugin.settings.hunks.hunkCommands &&
                    plugin.hunkActions.editor !== undefined
                );
            }
            plugin.promiseQueue.addTask(() => plugin.hunkActions.stageHunk());
            return true;
        },
    });

    plugin.addCommand({
        id: "preview-hunk",
        name: "変更ブロックをプレビュー",
        editorCheckCallback: (checking, _, __) => {
            if (checking) {
                return (
                    plugin.settings.hunks.hunkCommands &&
                    plugin.hunkActions.editor !== undefined
                );
            }
            const editor = plugin.hunkActions.editor!.editor;
            togglePreviewHunk(editor);
            return true;
        },
    });

    plugin.addCommand({
        id: "next-hunk",
        name: "次の変更ブロックに移動",
        editorCheckCallback: (checking, _, __) => {
            if (checking) {
                return (
                    plugin.settings.hunks.hunkCommands &&
                    plugin.hunkActions.editor !== undefined
                );
            }
            plugin.hunkActions.goToHunk("next");
            return true;
        },
    });

    plugin.addCommand({
        id: "prev-hunk",
        name: "前の変更ブロックに移動",
        editorCheckCallback: (checking, _, __) => {
            if (checking) {
                return (
                    plugin.settings.hunks.hunkCommands &&
                    plugin.hunkActions.editor !== undefined
                );
            }
            plugin.hunkActions.goToHunk("prev");
            return true;
        },
    });
}
