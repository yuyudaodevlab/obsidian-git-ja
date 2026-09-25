import type { App, RGB, TextComponent } from "obsidian";
import {
    moment,
    Notice,
    Platform,
    PluginSettingTab,
    Setting,
    TextAreaComponent,
} from "obsidian";
import {
    DATE_TIME_FORMAT_SECONDS,
    DEFAULT_SETTINGS,
    GIT_LINE_AUTHORING_MOVEMENT_DETECTION_MINIMAL_LENGTH,
} from "src/constants";
import { IsomorphicGit } from "src/gitManager/isomorphicGit";
import { SimpleGit } from "src/gitManager/simpleGit";
import { previewColor } from "src/editor/lineAuthor/lineAuthorProvider";
import type {
    LineAuthorDateTimeFormatOptions,
    LineAuthorDisplay,
    LineAuthorFollowMovement,
    LineAuthorSettings,
    LineAuthorTimezoneOption,
} from "src/editor/lineAuthor/model";
import type ObsidianGit from "src/main";
import type {
    ObsidianGitSettings,
    MergeStrategy,
    RebaseAutoStash,
    ShowAuthorInHistoryView,
    SyncMethod,
} from "src/types";
import { convertToRgb, rgbToString } from "src/utils";

const FORMAT_STRING_REFERENCE_URL =
    "https://momentjs.com/docs/#/parsing/string-format/";
const LINE_AUTHOR_FEATURE_WIKI_LINK =
    "https://publish.obsidian.md/git-doc/Line+Authoring";

export class ObsidianGitSettingsTab extends PluginSettingTab {
    lineAuthorColorSettings: Map<"oldest" | "newest", Setting> = new Map();
    constructor(
        app: App,
        private plugin: ObsidianGit
    ) {
        super(app, plugin);
    }

    icon = "git-pull-request";

    private get settings() {
        return this.plugin.settings;
    }

    display(): void {
        const { containerEl } = this;
        const plugin: ObsidianGit = this.plugin;

        let commitOrSync: string;
        if (plugin.settings.differentIntervalCommitAndPush) {
            commitOrSync = "コミット";
        } else {
            commitOrSync = "コミットと同期";
        }

        const gitReady = plugin.gitReady;

        containerEl.empty();
        if (!gitReady) {
            containerEl.createEl("p", {
                text: "Gitの準備ができていません。設定を確認すると、コミットと同期などを設定できます。",
            });
            containerEl.createEl("br");
        }

        let setting: Setting;
        if (gitReady) {
            new Setting(containerEl).setName("自動処理").setHeading();
            new Setting(containerEl)
                .setName("自動コミットと同期の間隔を個別に設定")
                .setDesc("コミットと同期に別々の実行間隔を設定する。")
                .addToggle((toggle) =>
                    toggle
                        .setValue(
                            plugin.settings.differentIntervalCommitAndPush
                        )
                        .onChange(async (value) => {
                            plugin.settings.differentIntervalCommitAndPush =
                                value;
                            await plugin.saveSettings();
                            plugin.automaticsManager.reload("commit", "push");
                            this.refreshDisplayWithDelay();
                        })
                );

            new Setting(containerEl)
                .setName(`自動${commitOrSync}の間隔（分）`)
                .setDesc(
                    `指定した分数ごとに${commitOrSync}を実行します。0（初期値）にすると無効になります。詳細は以下の設定で調整できます。`
                )
                .addText((text) => {
                    text.inputEl.type = "number";
                    this.setNonDefaultValue({
                        text,
                        settingsProperty: "autoSaveInterval",
                    });
                    text.setPlaceholder(
                        String(DEFAULT_SETTINGS.autoSaveInterval)
                    );
                    text.onChange(async (value) => {
                        if (value !== "") {
                            plugin.settings.autoSaveInterval = Number(value);
                        } else {
                            plugin.settings.autoSaveInterval =
                                DEFAULT_SETTINGS.autoSaveInterval;
                        }
                        await plugin.saveSettings();
                        plugin.automaticsManager.reload("commit");
                    });
                });

            setting = new Setting(containerEl)
                .setName(`編集を止めてから自動${commitOrSync}`)
                .setDesc(
                    `自動${commitOrSync}の間隔を0以外に設定する必要があります。有効にすると、ファイルの編集を止めてから「${plugin.settings.autoSaveInterval}」分ごとに自動${commitOrSync}を実行します。編集中は実行しません。無効にすると、編集時刻に関係なく実行します。`
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.autoBackupAfterFileChange)
                        .onChange(async (value) => {
                            plugin.settings.autoBackupAfterFileChange = value;
                            this.refreshDisplayWithDelay();

                            await plugin.saveSettings();
                            plugin.automaticsManager.reload("commit");
                        })
                );
            this.mayDisableSetting(
                setting,
                plugin.settings.setLastSaveToLastCommit
            );

            setting = new Setting(containerEl)
                .setName(`最新のコミットを基準に自動${commitOrSync}`)
                .setDesc(
                    `最新のコミット日時を、前回の自動${commitOrSync}の日時として使います。手動でコミットした場合に、自動${commitOrSync}の頻度を抑えます。`
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.setLastSaveToLastCommit)
                        .onChange(async (value) => {
                            plugin.settings.setLastSaveToLastCommit = value;
                            await plugin.saveSettings();
                            plugin.automaticsManager.reload("commit");
                            this.refreshDisplayWithDelay();
                        })
                );
            this.mayDisableSetting(
                setting,
                plugin.settings.autoBackupAfterFileChange
            );

            setting = new Setting(containerEl)
                .setName(`自動プッシュの間隔（分）`)
                .setDesc(
                    "指定した分数ごとにコミットをプッシュします。0（初期値）にすると無効になります。"
                )
                .addText((text) => {
                    text.inputEl.type = "number";
                    this.setNonDefaultValue({
                        text,
                        settingsProperty: "autoPushInterval",
                    });
                    text.setPlaceholder(
                        String(DEFAULT_SETTINGS.autoPushInterval)
                    );
                    text.onChange(async (value) => {
                        if (value !== "") {
                            plugin.settings.autoPushInterval = Number(value);
                        } else {
                            plugin.settings.autoPushInterval =
                                DEFAULT_SETTINGS.autoPushInterval;
                        }
                        await plugin.saveSettings();
                        plugin.automaticsManager.reload("push");
                    });
                });
            this.mayDisableSetting(
                setting,
                !plugin.settings.differentIntervalCommitAndPush
            );

            new Setting(containerEl)
                .setName("自動プルの間隔（分）")
                .setDesc(
                    "指定した分数ごとに変更をプルします。0（初期値）にすると無効になります。"
                )
                .addText((text) => {
                    text.inputEl.type = "number";
                    this.setNonDefaultValue({
                        text,
                        settingsProperty: "autoPullInterval",
                    });
                    text.setPlaceholder(
                        String(DEFAULT_SETTINGS.autoPullInterval)
                    );
                    text.onChange(async (value) => {
                        if (value !== "") {
                            plugin.settings.autoPullInterval = Number(value);
                        } else {
                            plugin.settings.autoPullInterval =
                                DEFAULT_SETTINGS.autoPullInterval;
                        }
                        await plugin.saveSettings();
                        plugin.automaticsManager.reload("pull");
                    });
                });

            new Setting(containerEl)
                .setName(
                    `自動${commitOrSync}の対象をステージ済みファイルに限定`
                )
                .setDesc(
                    `有効にすると、「${commitOrSync}」ではステージ済みのファイルだけをコミットします。無効にすると、変更したすべてのファイルをコミットします。`
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.autoCommitOnlyStaged)
                        .onChange(async (value) => {
                            plugin.settings.autoCommitOnlyStaged = value;
                            await plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName(`自動${commitOrSync}のたびにメッセージを入力`)
                .setDesc("メッセージを入力するポップアップを表示する。")
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.customMessageOnAutoBackup)
                        .onChange(async (value) => {
                            plugin.settings.customMessageOnAutoBackup = value;
                            await plugin.saveSettings();
                            this.refreshDisplayWithDelay();
                        })
                );

            setting = new Setting(containerEl)
                .setName(`自動${commitOrSync}のメッセージ`)
                .setDesc(
                    "使用できるプレースホルダー：「{{date}}」" +
                        "（下記参照）、「{{hostname}}」（下記参照）、「{{numFiles}}」（コミットする変更ファイル数）、「{{files}}」（変更ファイルの一覧）。"
                )
                .addTextArea((text) => {
                    text.setPlaceholder(
                        DEFAULT_SETTINGS.autoCommitMessage
                    ).onChange(async (value) => {
                        if (value === "") {
                            plugin.settings.autoCommitMessage =
                                DEFAULT_SETTINGS.autoCommitMessage;
                        } else {
                            plugin.settings.autoCommitMessage = value;
                        }
                        await plugin.saveSettings();
                    });
                    this.setNonDefaultValue({
                        text,
                        settingsProperty: "autoCommitMessage",
                    });
                });
            this.mayDisableSetting(
                setting,
                plugin.settings.customMessageOnAutoBackup
            );

            new Setting(containerEl).setName("コミット").setHeading();

            new Setting(containerEl)
                .setName("ステージ済みの変更がなければすべてステージ")
                .setDesc(
                    "「コミット」の実行時にステージ済みの変更がなければ、すべての変更をステージしてコミットします。無効にすると、先に変更をステージする必要があります。「すべての変更をコミット」と「コミットと同期」には影響しません。"
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.autoStageOnEmptyIndex)
                        .onChange(async (value) => {
                            plugin.settings.autoStageOnEmptyIndex = value;
                            await plugin.saveSettings();
                        })
                );

            const manualCommitMessageSetting = new Setting(containerEl)
                .setName("手動コミットのメッセージ")
                .setDesc(
                    "使用できるプレースホルダー：「{{date}}」" +
                        "（下記参照）、「{{hostname}}」（下記参照）、「{{numFiles}}」（コミットする変更ファイル数）、「{{files}}」（変更ファイルの一覧）。空欄にすると、コミットのたびに入力が必要になります。"
                );
            manualCommitMessageSetting.addTextArea((text) => {
                manualCommitMessageSetting.addButton((button) => {
                    button
                        .setIcon("reset")
                        .setTooltip(
                            `初期値に戻す：「${DEFAULT_SETTINGS.commitMessage}」`
                        )
                        .onClick(() => {
                            text.setValue(DEFAULT_SETTINGS.commitMessage);
                            text.onChanged();
                        });
                });
                text.setValue(plugin.settings.commitMessage);
                text.onChange(async (value) => {
                    plugin.settings.commitMessage = value;
                    await plugin.saveSettings();
                });
            });

            if (Platform.isDesktopApp)
                new Setting(containerEl)
                    .setName("コミットメッセージを生成するスクリプト")
                    .setDesc(
                        "「sh -c」でスクリプトを実行し、コミットメッセージを生成します。AIツールによるメッセージ生成にも使えます。使用できるプレースホルダーは「{{hostname}}」と「{{date}}」です。"
                    )
                    .addText((text) => {
                        text.onChange(async (value) => {
                            if (value === "") {
                                plugin.settings.commitMessageScript =
                                    DEFAULT_SETTINGS.commitMessageScript;
                            } else {
                                plugin.settings.commitMessageScript = value;
                            }
                            await plugin.saveSettings();
                        });
                        this.setNonDefaultValue({
                            text,
                            settingsProperty: "commitMessageScript",
                        });
                    });

            const datePlaceholderSetting = new Setting(containerEl)
                .setName("「{{date}}」の書式")
                .addMomentFormat((text) =>
                    text
                        .setDefaultFormat(plugin.settings.commitDateFormat)
                        .setValue(plugin.settings.commitDateFormat)
                        .onChange(async (value) => {
                            plugin.settings.commitDateFormat = value;
                            await plugin.saveSettings();
                        })
                );

            datePlaceholderSetting.descEl.createSpan({
                text: `日付の書式を指定します（例：「${DATE_TIME_FORMAT_SECONDS}」）。その他の書式は`,
            });
            datePlaceholderSetting.descEl.createEl("a", {
                text: "Moment.jsのドキュメント",
                href: FORMAT_STRING_REFERENCE_URL,
                attr: {
                    target: "_blank",
                },
            });
            datePlaceholderSetting.descEl.createSpan({
                text: "で確認できます。",
            });

            new Setting(containerEl)
                .setName("「{{hostname}}」に使うホスト名")
                .setDesc(
                    "デバイスごとにホスト名を指定します。デスクトップで未設定の場合は、OSのホスト名を使います。"
                )
                .addText((text) =>
                    text
                        .setValue(plugin.localStorage.getHostname() ?? "")
                        .onChange((value) => {
                            plugin.localStorage.setHostname(value);
                        })
                );

            new Setting(containerEl)
                .setName("コミットメッセージのプレビュー")
                .addButton((button) =>
                    button.setButtonText("プレビュー").onClick(async () => {
                        const commitMessagePreview =
                            await plugin.gitManager.formatCommitMessage(
                                plugin.settings.commitMessage
                            );
                        new Notice(`${commitMessagePreview}`);
                    })
                );

            new Setting(containerEl)
                .setName("コミット本文に変更ファイルの一覧を追加")
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.listChangedFilesInMessageBody)
                        .onChange(async (value) => {
                            plugin.settings.listChangedFilesInMessageBody =
                                value;
                            await plugin.saveSettings();
                        })
                );

            new Setting(containerEl).setName("プル").setHeading();

            if (plugin.gitManager instanceof SimpleGit)
                new Setting(containerEl)
                    .setName("統合方法")
                    .setDesc(
                        "リモートブランチのコミットをローカルブランチに統合する方法を選ぶ。"
                    )
                    .addDropdown((dropdown) => {
                        const options: Record<SyncMethod, string> = {
                            merge: "マージ",
                            rebase: "リベース",
                            reset: "別の同期サービスを使用（作業ディレクトリーを変更せず、HEADのみ更新）",
                        };
                        dropdown.addOptions(options);
                        dropdown.setValue(plugin.settings.syncMethod);

                        dropdown.onChange(async (option) => {
                            plugin.settings.syncMethod = option as SyncMethod;
                            await plugin.saveSettings();
                            this.refreshDisplayWithDelay();
                        });
                    });

            if (
                plugin.gitManager instanceof SimpleGit &&
                plugin.settings.syncMethod === "rebase"
            )
                new Setting(containerEl)
                    .setName("リベース時に変更を自動で一時退避")
                    .setDesc(
                        "リベース前にローカルの変更を一時退避し、完了後に復元します。復元時に競合が起きることがあります。"
                    )
                    .addDropdown((dropdown) => {
                        const options: Record<RebaseAutoStash, string> = {
                            enabled: "有効",
                            disabled: "無効",
                            "git-config": "Gitの設定を使用",
                        };
                        dropdown.addOptions(options);
                        dropdown.setValue(plugin.settings.rebaseAutoStash);

                        dropdown.onChange(async (option) => {
                            plugin.settings.rebaseAutoStash =
                                option as RebaseAutoStash;
                            await plugin.saveSettings();
                        });
                    });

            new Setting(containerEl)
                .setName("競合時の統合方法")
                .setDesc(
                    "リモートの変更をプルしたときの競合の解決方法を選びます。ローカルまたはリモートの変更を自動で優先できます。"
                )
                .addDropdown((dropdown) => {
                    const options: Record<MergeStrategy, string> = {
                        none: "指定なし（Gitの初期設定）",
                        ours: "ローカルの変更を優先",
                        theirs: "リモートの変更を優先",
                    };
                    dropdown.addOptions(options);
                    dropdown.setValue(plugin.settings.mergeStrategy);

                    dropdown.onChange(async (option) => {
                        plugin.settings.mergeStrategy = option as MergeStrategy;
                        await plugin.saveSettings();
                    });
                });

            new Setting(containerEl)
                .setName("起動時にプル")
                .setDesc("Obsidianの起動時にコミットを自動でプルする。")
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.autoPullOnBoot)
                        .onChange(async (value) => {
                            plugin.settings.autoPullOnBoot = value;
                            await plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName("コミットと同期")
                .setDesc(
                    "初期設定では、すべての変更をステージ→コミット→プル→プッシュの順に実行します。定期的に実行すると、ローカルとリモートのリポジトリーを同期できます。"
                )
                .setHeading();

            setting = new Setting(containerEl)
                .setName("「コミットと同期」でプッシュ")
                .setDesc(
                    `通常はコミット後にプッシュします。無効にすると、コミット${plugin.settings.pullBeforePush ? "とプル" : ""}だけを実行します。操作名は「コミットと同期」のままです。`
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(!plugin.settings.disablePush)
                        .onChange(async (value) => {
                            plugin.settings.disablePush = !value;
                            this.refreshDisplayWithDelay();
                            await plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName("「コミットと同期」でプル")
                .setDesc(
                    `「コミットと同期」でプルも実行します。無効にすると、コミット${plugin.settings.disablePush ? "" : "とプッシュ"}だけを実行します。`
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.pullBeforePush)
                        .onChange(async (value) => {
                            plugin.settings.pullBeforePush = value;
                            this.refreshDisplayWithDelay();
                            await plugin.saveSettings();
                        })
                );

            if (plugin.gitManager instanceof SimpleGit) {
                new Setting(containerEl)
                    .setName("プッシュ前にコミットをまとめる")
                    .setDesc(
                        "「コミットと同期」で、プッシュする直前に未プッシュのコミットを1つにまとめます。頻繁にコミットしてもリモートの履歴を整理できます。書き換えるのは未プッシュのコミットだけなので、強制プッシュは不要です。"
                    )
                    .addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.squashCommitsBeforePush)
                            .onChange(async (value) => {
                                plugin.settings.squashCommitsBeforePush = value;
                                await plugin.saveSettings();
                            })
                    );
            }

            if (plugin.gitManager instanceof SimpleGit) {
                new Setting(containerEl)
                    .setName("変更ブロックの管理")
                    .setDesc(
                        "変更ブロックは、エディター内の連続した行の変更をまとめた単位。"
                    )
                    .setHeading();

                new Setting(containerEl)
                    .setName("変更マーカー")
                    .setDesc(
                        "エディターに色付きの変更マーカーを表示し、変更ブロックごとにステージ、変更の破棄、プレビューを行う。"
                    )
                    .addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.hunks.showSigns)
                            .onChange(async (value) => {
                                plugin.settings.hunks.showSigns = value;
                                await plugin.saveSettings();
                                plugin.editorIntegration.refreshSignsSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName("変更ブロックのコマンド")
                    .setDesc(
                        "変更ブロックごとのステージや変更の破棄と、前後の変更ブロックへの移動コマンドを追加する。"
                    )
                    .addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.hunks.hunkCommands)
                            .onChange(async (value) => {
                                plugin.settings.hunks.hunkCommands = value;
                                await plugin.saveSettings();

                                plugin.editorIntegration.refreshSignsSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName("ステータスバーに行の変更数を表示")
                    .addDropdown((toggle) =>
                        toggle
                            .addOptions({
                                disabled: "無効",
                                colored: "カラー",
                                monochrome: "モノクロ",
                            })
                            .setValue(plugin.settings.hunks.statusBar)
                            .onChange(async (option) => {
                                plugin.settings.hunks.statusBar =
                                    option as ObsidianGitSettings["hunks"]["statusBar"];
                                await plugin.saveSettings();
                                plugin.editorIntegration.refreshSignsSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName("行ごとの作成者情報")
                    .setHeading();

                this.addLineAuthorInfoSettings();
            }
        }

        new Setting(containerEl).setName("履歴ビュー").setHeading();

        new Setting(containerEl)
            .setName("作成者を表示")
            .setDesc("履歴ビューにコミットの作成者を表示する。")
            .addDropdown((dropdown) => {
                const options: Record<ShowAuthorInHistoryView, string> = {
                    hide: "非表示",
                    full: "フルネーム",
                    initials: "イニシャル",
                };
                dropdown.addOptions(options);
                dropdown.setValue(plugin.settings.authorInHistoryView);
                dropdown.onChange(async (option) => {
                    plugin.settings.authorInHistoryView =
                        option as ShowAuthorInHistoryView;
                    await plugin.saveSettings();
                    await plugin.refresh();
                });
            });

        new Setting(containerEl)
            .setName("日付を表示")
            .setDesc(
                "履歴ビューにコミットの日付を表示します。日付には「{{date}}」の書式を使います。"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(plugin.settings.dateInHistoryView)
                    .onChange(async (value) => {
                        plugin.settings.dateInHistoryView = value;
                        await plugin.saveSettings();
                        await plugin.refresh();
                    })
            );

        new Setting(containerEl).setName("ソース管理ビュー").setHeading();

        new Setting(containerEl)
            .setName("ファイルの変更時にソース管理ビューを自動更新")
            .setDesc(
                "処理速度が遅いデバイスでは、動作が重くなることがあります。その場合は、この設定を無効にしてください。"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(plugin.settings.refreshSourceControl)
                    .onChange(async (value) => {
                        plugin.settings.refreshSourceControl = value;
                        await plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("ソース管理ビューの更新待ち時間")
            .setDesc(
                "ファイルの変更からソース管理ビューの更新までの待ち時間をミリ秒で指定する。"
            )
            .addText((text) => {
                const MIN_SOURCE_CONTROL_REFRESH_INTERVAL = 500;
                text.inputEl.type = "number";
                this.setNonDefaultValue({
                    text,
                    settingsProperty: "refreshSourceControlTimer",
                });
                text.setPlaceholder(
                    String(DEFAULT_SETTINGS.refreshSourceControlTimer)
                );
                text.onChange(async (value) => {
                    // Without this check, if the textbox is empty or the input is invalid, MIN_SOURCE_CONTROL_REFRESH_INTERVAL would be saved instead of saving the default value.
                    if (value !== "" && Number.isInteger(Number(value))) {
                        plugin.settings.refreshSourceControlTimer = Math.max(
                            Number(value),
                            MIN_SOURCE_CONTROL_REFRESH_INTERVAL
                        );
                    } else {
                        plugin.settings.refreshSourceControlTimer =
                            DEFAULT_SETTINGS.refreshSourceControlTimer;
                    }
                    await plugin.saveSettings();
                    plugin.setRefreshDebouncer();
                });
            });

        new Setting(containerEl).setName("その他").setHeading();

        if (plugin.gitManager instanceof SimpleGit) {
            new Setting(containerEl)
                .setName("差分ビューの表示形式")
                .setDesc(
                    "差分ビューの表示形式を選びます。「左右に並べる」ではエディターが差分を計算するため、Gitの差分と異なる場合があります。この形式では、差分ビューでテキストを編集できます。"
                )
                .addDropdown((dropdown) => {
                    const options: Record<
                        ObsidianGitSettings["diffStyle"],
                        string
                    > = {
                        split: "左右に並べる",
                        git_unified: "1つにまとめる",
                    };
                    dropdown.addOptions(options);
                    dropdown.setValue(plugin.settings.diffStyle);
                    dropdown.onChange(async (option) => {
                        plugin.settings.diffStyle =
                            option as ObsidianGitSettings["diffStyle"];
                        await plugin.saveSettings();
                    });
                });

            new Setting(containerEl)
                .setName("左右に並べた差分の計算時間の上限")
                .setDesc(
                    "詳細な差分の計算時間の上限をミリ秒で指定します。大きい値ほど変更の多い大容量ファイルの精度が上がりますが、応答が遅くなることがあります。読み取り専用の差分では、この値の10倍を使います。"
                )
                .addText((text) => {
                    text.inputEl.type = "number";
                    text.inputEl.min = "1";
                    text.inputEl.step = "1";
                    this.setNonDefaultValue({
                        text,
                        settingsProperty: "diffTimeout",
                    });
                    text.setPlaceholder(String(DEFAULT_SETTINGS.diffTimeout));
                    text.onChange(async (value) => {
                        const timeout = Number(value);
                        plugin.settings.diffTimeout =
                            value !== "" &&
                            Number.isInteger(timeout) &&
                            timeout > 0
                                ? timeout
                                : DEFAULT_SETTINGS.diffTimeout;
                        await plugin.saveSettings();
                    });
                });
        }

        new Setting(containerEl)
            .setName("操作状況の通知を無効化")
            .setDesc(
                "Git操作の通知を無効にし、作業への割り込みを減らす（状況はステータスバーで確認）。"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(plugin.settings.disablePopups)
                    .onChange(async (value) => {
                        plugin.settings.disablePopups = value;
                        this.refreshDisplayWithDelay();
                        await plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("エラー通知を無効化")
            .setDesc(
                "すべてのエラー通知を無効にし、作業への割り込みを減らす（状況はステータスバーで確認）。"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(!plugin.settings.showErrorNotices)
                    .onChange(async (value) => {
                        plugin.settings.showErrorNotices = !value;
                        await plugin.saveSettings();
                    })
            );

        if (!plugin.settings.disablePopups)
            new Setting(containerEl)
                .setName("変更がない場合の通知を非表示")
                .setDesc("コミットやプッシュする変更がない場合は通知しない。")
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.disablePopupsForNoChanges)
                        .onChange(async (value) => {
                            plugin.settings.disablePopupsForNoChanges = value;
                            await plugin.saveSettings();
                        })
                );

        new Setting(containerEl)
            .setName("ステータスバーを表示")
            .setDesc("変更を反映するにはObsidianの再起動が必要。")
            .addToggle((toggle) =>
                toggle
                    .setValue(plugin.settings.showStatusBar)
                    .onChange(async (value) => {
                        plugin.settings.showStatusBar = value;
                        await plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("ファイルメニューに操作を追加")
            .setDesc(
                `ファイルメニューに「ステージ」「ステージを解除」「.gitignoreに追加」を追加する。`
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(plugin.settings.showFileMenu)
                    .onChange(async (value) => {
                        plugin.settings.showFileMenu = value;
                        await plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("ステータスバーにブランチを表示")
            .setDesc("変更を反映するにはObsidianの再起動が必要。")
            .addToggle((toggle) =>
                toggle
                    .setValue(plugin.settings.showBranchStatusBar)
                    .onChange(async (value) => {
                        plugin.settings.showBranchStatusBar = value;
                        await plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("ステータスバーに変更ファイル数を表示")
            .addToggle((toggle) =>
                toggle
                    .setValue(plugin.settings.changedFilesInStatusBar)
                    .onChange(async (value) => {
                        plugin.settings.changedFilesInStatusBar = value;
                        await plugin.saveSettings();
                    })
            );

        if (plugin.gitManager instanceof IsomorphicGit) {
            new Setting(containerEl)
                .setName("認証とコミットの作成者")
                .setHeading();
        } else {
            new Setting(containerEl).setName("コミットの作成者").setHeading();
        }

        if (plugin.gitManager instanceof IsomorphicGit)
            new Setting(containerEl)
                .setName("Gitサーバーのユーザー名（GitHubのユーザー名など）")
                .addText((cb) => {
                    cb.setValue(plugin.localStorage.getUsername() ?? "");
                    cb.onChange((value) => {
                        plugin.localStorage.setUsername(value);
                    });
                });

        if (plugin.gitManager instanceof IsomorphicGit)
            new Setting(containerEl)
                .setName("パスワード／個人アクセストークン")
                .setDesc(
                    "パスワードを入力します。入力後に表示して確認することはできません。"
                )
                .addText((cb) => {
                    cb.inputEl.autocapitalize = "off";
                    cb.inputEl.autocomplete = "off";
                    cb.inputEl.spellcheck = false;
                    cb.onChange((value) => {
                        plugin.localStorage.setPassword(value);
                    });
                });

        if (plugin.gitReady)
            new Setting(containerEl)
                .setName("コミットの作成者名")
                .addText(async (cb) => {
                    cb.setValue(
                        (await plugin.gitManager.getConfig("user.name")) ?? ""
                    );
                    cb.onChange(async (value) => {
                        await plugin.gitManager.setConfig(
                            "user.name",
                            value == "" ? undefined : value
                        );
                    });
                });

        if (plugin.gitReady)
            new Setting(containerEl)
                .setName("コミットの作成者のメールアドレス")
                .addText(async (cb) => {
                    cb.setValue(
                        (await plugin.gitManager.getConfig("user.email")) ?? ""
                    );
                    cb.onChange(async (value) => {
                        await plugin.gitManager.setConfig(
                            "user.email",
                            value == "" ? undefined : value
                        );
                    });
                });

        new Setting(containerEl)
            .setName("詳細設定")
            .setDesc(
                "通常は変更する必要はないが、特殊な環境では設定が必要になる場合がある。"
            )
            .setHeading();

        if (plugin.gitManager instanceof SimpleGit) {
            new Setting(containerEl)
                .setName("サブモジュールを更新")
                .setDesc(
                    "「コミットと同期」と「プル」でサブモジュールも処理します。競合ファイルの処理と、プル・プッシュ・コミットしたファイル数の表示には未対応です。各サブモジュールに追跡ブランチを設定する必要があります。"
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(plugin.settings.updateSubmodules)
                        .onChange(async (value) => {
                            plugin.settings.updateSubmodules = value;
                            await plugin.saveSettings();
                        })
                );
            if (plugin.settings.updateSubmodules) {
                new Setting(containerEl)
                    .setName("サブモジュールのブランチも切り替える")
                    .setDesc(
                        "ルートリポジトリーでブランチを切り替えるとき、同名のブランチがあればサブモジュールも再帰的に切り替える。"
                    )
                    .addToggle((toggle) =>
                        toggle
                            .setValue(plugin.settings.submoduleRecurseCheckout)
                            .onChange(async (value) => {
                                plugin.settings.submoduleRecurseCheckout =
                                    value;
                                await plugin.saveSettings();
                            })
                    );
            }
        }

        if (plugin.gitManager instanceof SimpleGit)
            new Setting(containerEl)
                .setName("Git実行ファイルのパス")
                .setDesc(
                    "Git実行ファイルのパスを指定します。通常はPATHからGitが見つかるため、独自の場所にインストールした場合のみ設定が必要です。"
                )
                .addText((cb) => {
                    cb.setValue(plugin.localStorage.getGitPath() ?? "");
                    cb.setPlaceholder("git");
                    cb.onChange((value) => {
                        plugin.localStorage.setGitPath(value);
                        plugin.gitManager
                            .updateGitPath(value || "git")
                            .catch((e) => plugin.displayError(e));
                    });
                });

        if (plugin.gitManager instanceof SimpleGit)
            new Setting(containerEl)
                .setName("追加の環境変数")
                .setDesc(
                    "環境変数を1行に1つずつ「KEY=VALUE」の形式で指定する。"
                )
                .addTextArea((cb) => {
                    cb.setPlaceholder("GIT_DIR=/path/to/git/dir");
                    cb.setValue(plugin.localStorage.getEnvVars().join("\n"));
                    cb.onChange((value) => {
                        plugin.localStorage.setEnvVars(value.split("\n"));
                    });
                });

        if (plugin.gitManager instanceof SimpleGit)
            new Setting(containerEl)
                .setName("PATH環境変数に追加するパス")
                .setDesc("パスを1行に1つずつ指定する。")
                .addTextArea((cb) => {
                    cb.setValue(plugin.localStorage.getPATHPaths().join("\n"));
                    cb.onChange((value) => {
                        plugin.localStorage.setPATHPaths(value.split("\n"));
                    });
                });
        if (plugin.gitManager instanceof SimpleGit)
            new Setting(containerEl)
                .setName("新しい環境変数で再読み込み")
                .setDesc(
                    "追加済みの環境変数の削除は、Obsidianを再起動するまで反映されない。"
                )
                .addButton((cb) => {
                    cb.setButtonText("再読み込み");
                    cb.setCta();
                    cb.onClick(async () => {
                        await (plugin.gitManager as SimpleGit).setGitInstance();
                    });
                });

        new Setting(containerEl)
            .setName("基準パス（Gitリポジトリーのパス）")
            .setDesc(
                `Gitを実行する場所を保管庫からの相対パスで指定します。Gitリポジトリーが保管庫のルートより下にある場合に設定します。Windowsでは「/」の代わりに「\\」を使います。`
            )
            .addText((cb) => {
                cb.setValue(plugin.settings.basePath);
                cb.setPlaceholder("directory/directory-with-git-repo");
                cb.onChange(async (value) => {
                    plugin.settings.basePath = value;
                    await plugin.saveSettings();
                    plugin.gitManager
                        .updateBasePath(value || "")
                        .catch((e) => plugin.displayError(e));
                });
            });

        new Setting(containerEl)
            .setName("Gitディレクトリーのパス（「.git」の代わりに使用）")
            .setDesc(
                `GIT_DIR環境変数に対応します。相対パスは基準パスから解決し、基準パスが未設定なら保管庫のルートから解決します。反映にはObsidianの再起動が必要です。Windowsでは「/」の代わりに「\\」を使います。`
            )
            .addText((cb) => {
                cb.setValue(plugin.settings.gitDir);
                cb.setPlaceholder(".git");
                cb.onChange(async (value) => {
                    plugin.settings.gitDir = value;
                    await plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("このデバイスで無効化")
            .setDesc(
                "このデバイスでプラグインを無効にします。この設定は同期されません。"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(plugin.localStorage.getPluginDisabled())
                    .onChange((value) => {
                        plugin.localStorage.setPluginDisabled(value);
                        if (value) {
                            plugin.unloadPlugin();
                        } else {
                            plugin
                                .init({ fromReload: true })
                                .catch((e) => plugin.displayError(e));
                        }
                        new Notice(
                            "変更を反映するにはObsidianの再起動が必要。"
                        );
                    })
            );

        new Setting(containerEl).setName("サポート").setHeading();
        new Setting(containerEl)
            .setName("寄付")
            .setDesc("寄付でこのプラグインの開発を支援する。")
            .addButton((bt) => {
                const link = bt.buttonEl.parentElement?.createEl("a", {
                    href: "https://ko-fi.com/F1F195IQ5",
                    attr: {
                        target: "_blank",
                    },
                });
                if (link) {
                    link.createEl("img", {
                        attr: {
                            height: "36",
                            style: "border:0px;height:36px;",
                            src: "https://cdn.ko-fi.com/cdn/kofi3.png?v=3",
                            border: "0",
                            alt: "ko-fi.comで開発を支援",
                        },
                    });
                    bt.buttonEl.remove();
                }
            });

        const debugDiv = containerEl.createDiv();
        debugDiv.setAttr("align", "center");
        debugDiv.setAttr("style", "margin: var(--size-4-2)");

        const debugButton = debugDiv.createEl("button");
        debugButton.setText("デバッグ情報をコピー");
        debugButton.onclick = async () => {
            await window.navigator.clipboard.writeText(
                JSON.stringify(
                    {
                        settings: this.plugin.settings,
                        pluginVersion: this.plugin.manifest.version,
                    },
                    null,
                    4
                )
            );
            new Notice(
                "デバッグ情報をクリップボードにコピーしました。機密情報が含まれる可能性があります。"
            );
        };

        if (Platform.isDesktopApp) {
            const info = containerEl.createDiv();
            info.setAttr("align", "center");
            info.setText(
                "デバッグとログ：\n次のキーでコンソールを開くと、このプラグインや他のプラグインのログを確認できます。"
            );
            const keys = containerEl.createDiv();
            keys.setAttr("align", "center");
            keys.addClass("obsidian-git-shortcuts");
            if (Platform.isMacOS === true) {
                keys.createEl("kbd", { text: "CMD (⌘) + OPTION (⌥) + I" });
            } else {
                keys.createEl("kbd", { text: "CTRL + SHIFT + I" });
            }
        }
    }

    mayDisableSetting(setting: Setting, disable: boolean) {
        if (disable) {
            setting.setDisabled(disable);
            setting.setClass("obsidian-git-disabled");
        }
    }

    public configureLineAuthorShowStatus(show: boolean) {
        this.settings.lineAuthor.show = show;
        void this.plugin.saveSettings();

        if (show) this.plugin.editorIntegration.activateLineAuthoring();
        else this.plugin.editorIntegration.deactiveLineAuthoring();
    }

    /**
     * Persists the setting {@link key} with value {@link value} and
     * refreshes the line author info views.
     */
    public async lineAuthorSettingHandler<
        K extends keyof ObsidianGitSettings["lineAuthor"],
    >(key: K, value: ObsidianGitSettings["lineAuthor"][K]): Promise<void> {
        this.settings.lineAuthor[key] = value;
        await this.plugin.saveSettings();
        this.plugin.editorIntegration.lineAuthoringFeature.refreshLineAuthorViews();
    }

    /**
     * Ensure, that certain last shown values are persistent in the settings.
     *
     * Necessary for the line author info gutter context menus.
     */
    public beforeSaveSettings() {
        const laSettings = this.settings.lineAuthor;
        if (laSettings.authorDisplay !== "hide") {
            laSettings.lastShownAuthorDisplay = laSettings.authorDisplay;
        }
        if (laSettings.dateTimeFormatOptions !== "hide") {
            laSettings.lastShownDateTimeFormatOptions =
                laSettings.dateTimeFormatOptions;
        }
    }

    private addLineAuthorInfoSettings() {
        const baseLineAuthorInfoSetting = new Setting(this.containerEl).setName(
            "各行の横にコミットの作成者情報を表示"
        );

        if (
            !this.plugin.editorIntegration.lineAuthoringFeature.isAvailableOnCurrentPlatform()
        ) {
            baseLineAuthorInfoSetting
                .setDesc("現在はデスクトップでのみ利用できる。")
                .setDisabled(true);
        }

        baseLineAuthorInfoSetting.descEl.createEl("a", {
            href: LINE_AUTHOR_FEATURE_WIKI_LINK,
            text: "機能ガイドと使用例",
            attr: {
                target: "_blank",
            },
        });
        baseLineAuthorInfoSetting.descEl.createEl("br");
        baseLineAuthorInfoSetting.descEl.createSpan({
            text: "コミットハッシュ、作成者名、作成日時の表示を個別に切り替えられます。",
        });
        baseLineAuthorInfoSetting.descEl.createEl("br");
        baseLineAuthorInfoSetting.descEl.createSpan({
            text: "すべて非表示にすると、経過時間に応じて色分けしたサイドバーだけを表示します。",
        });

        baseLineAuthorInfoSetting.addToggle((toggle) =>
            toggle.setValue(this.settings.lineAuthor.show).onChange((value) => {
                this.configureLineAuthorShowStatus(value);
                this.refreshDisplayWithDelay();
            })
        );

        if (this.settings.lineAuthor.show) {
            const trackMovement = new Setting(this.containerEl)
                .setName("ファイルやコミットをまたぐ移動とコピーを追跡")
                .addDropdown((dropdown) => {
                    dropdown.addOptions({
                        inactive: "追跡しない（初期設定）",
                        "same-commit": "同じコミット内を追跡",
                        "all-commits":
                            "すべてのコミットを追跡（処理が遅くなる場合あり）",
                    });
                    dropdown.setValue(this.settings.lineAuthor.followMovement);
                    dropdown.onChange((value) =>
                        this.lineAuthorSettingHandler(
                            "followMovement",
                            value as LineAuthorFollowMovement
                        )
                    );
                });

            trackMovement.descEl.createSpan({
                text: "初期設定（無効）では、各行を最後に変更したコミットを表示します。",
            });
            trackMovement.descEl.createEl("br");
            trackMovement.descEl.createSpan({ text: "「" });
            trackMovement.descEl.createEl("i", {
                text: "同じコミット内を追跡",
            });
            trackMovement.descEl.createSpan({
                text: "」では、同じコミット内でのテキストの切り取り・コピー・貼り付けを追跡し、元の作成コミットを表示します。",
            });
            trackMovement.descEl.createEl("br");
            trackMovement.descEl.createSpan({ text: "「" });
            trackMovement.descEl.createEl("i", {
                text: "すべてのコミットを追跡",
            });
            trackMovement.descEl.createSpan({
                text: "」では、複数のコミットをまたぐテキストの切り取り・コピー・貼り付けを検出します。",
            });
            trackMovement.descEl.createEl("br");
            trackMovement.descEl.createSpan({ text: "使用するのは" });
            trackMovement.descEl.createEl("a", {
                href: "https://git-scm.com/docs/git-blame",
                text: "git-blame",
                attr: {
                    target: "_blank",
                },
            });
            trackMovement.descEl.createSpan({
                text: `です。同じコミット内（またはすべてのコミット）で「${GIT_LINE_AUTHORING_MOVEMENT_DETECTION_MINIMAL_LENGTH}」文字以上が一致すると、`,
            });
            trackMovement.descEl.createEl("em", { text: "元の" });
            trackMovement.descEl.createSpan({
                text: "コミットの情報を表示します。",
            });

            new Setting(this.containerEl)
                .setName("コミットハッシュを表示")
                .addToggle((tgl) => {
                    tgl.setValue(this.settings.lineAuthor.showCommitHash);
                    tgl.onChange((value: boolean) =>
                        this.lineAuthorSettingHandler("showCommitHash", value)
                    );
                });

            new Setting(this.containerEl)
                .setName("作成者名の表示")
                .setDesc("作成者名の表示の有無と形式を選ぶ。")
                .addDropdown((dropdown) => {
                    const options: Record<LineAuthorDisplay, string> = {
                        hide: "非表示",
                        initials: "イニシャル（初期設定）",
                        "first name": "名",
                        "last name": "姓",
                        full: "フルネーム",
                    };
                    dropdown.addOptions(options);
                    dropdown.setValue(this.settings.lineAuthor.authorDisplay);

                    dropdown.onChange(async (value) =>
                        this.lineAuthorSettingHandler(
                            "authorDisplay",
                            value as LineAuthorDisplay
                        )
                    );
                });

            new Setting(this.containerEl)
                .setName("作成日時の表示")
                .setDesc("行の作成日時の表示の有無と形式を選ぶ。")
                .addDropdown((dropdown) => {
                    const options: Record<
                        LineAuthorDateTimeFormatOptions,
                        string
                    > = {
                        hide: "非表示",
                        date: "日付（初期設定）",
                        datetime: "日時",
                        "natural language": "相対日時",
                        custom: "カスタム",
                    };
                    dropdown.addOptions(options);
                    dropdown.setValue(
                        this.settings.lineAuthor.dateTimeFormatOptions
                    );

                    dropdown.onChange(async (value) => {
                        await this.lineAuthorSettingHandler(
                            "dateTimeFormatOptions",
                            value as LineAuthorDateTimeFormatOptions
                        );
                        this.refreshDisplayWithDelay();
                    });
                });

            if (this.settings.lineAuthor.dateTimeFormatOptions === "custom") {
                const dateTimeFormatCustomStringSetting = new Setting(
                    this.containerEl
                );

                dateTimeFormatCustomStringSetting
                    .setName("作成日時のカスタム書式")
                    .addText((cb) => {
                        cb.setValue(
                            this.settings.lineAuthor.dateTimeFormatCustomString
                        );
                        cb.setPlaceholder("YYYY-MM-DD HH:mm");

                        cb.onChange(async (value) => {
                            await this.lineAuthorSettingHandler(
                                "dateTimeFormatCustomString",
                                value
                            );
                            this.setCustomDateTimeDescription(
                                dateTimeFormatCustomStringSetting.descEl,
                                value
                            );
                        });
                    });

                this.setCustomDateTimeDescription(
                    dateTimeFormatCustomStringSetting.descEl,
                    this.settings.lineAuthor.dateTimeFormatCustomString
                );
            }

            const timezoneSetting = new Setting(this.containerEl)
                .setName("作成日時のタイムゾーン")
                .addDropdown((dropdown) => {
                    const options: Record<LineAuthorTimezoneOption, string> = {
                        "viewer-local": "自分のタイムゾーン（初期設定）",
                        "author-local": "作成者のタイムゾーン",
                        utc0000: "UTC+0000/Z",
                    };
                    dropdown.addOptions(options);
                    dropdown.setValue(
                        this.settings.lineAuthor.dateTimeTimezone
                    );

                    dropdown.onChange(async (value) =>
                        this.lineAuthorSettingHandler(
                            "dateTimeTimezone",
                            value as LineAuthorTimezoneOption
                        )
                    );
                });
            timezoneSetting.descEl.empty();
            timezoneSetting.descEl.createSpan({
                text: "作成日時を表示するタイムゾーンです。自分のタイムゾーン（初期設定）、コミット作成時の作成者のタイムゾーン、または",
            });
            timezoneSetting.descEl.createEl("a", {
                text: "UTC±00:00",
                href: "https://en.wikipedia.org/wiki/UTC%C2%B100:00",
            });
            timezoneSetting.descEl.createSpan({
                text: "から選びます。",
            });

            const oldestAgeSetting = new Setting(this.containerEl).setName(
                "色分けする経過時間の上限"
            );

            this.setOldestAgeDescription(
                oldestAgeSetting.descEl,
                this.settings.lineAuthor.coloringMaxAge
            );

            oldestAgeSetting.addText((text) => {
                text.setPlaceholder("1y");
                text.setValue(this.settings.lineAuthor.coloringMaxAge);
                text.onChange(async (value) => {
                    const duration = parseColoringMaxAgeDuration(value);
                    const valid = duration !== undefined;
                    this.setOldestAgeDescription(
                        oldestAgeSetting.descEl,
                        value
                    );
                    if (valid) {
                        await this.lineAuthorSettingHandler(
                            "coloringMaxAge",
                            value
                        );
                        this.refreshColorSettingsName("oldest");
                    }
                });
            });

            this.createColorSetting("newest");
            this.createColorSetting("oldest");

            const textColorSetting = new Setting(this.containerEl)
                .setName("文字色")
                .addText((field) => {
                    field.setValue(this.settings.lineAuthor.textColorCss);
                    field.onChange(async (value) => {
                        await this.lineAuthorSettingHandler(
                            "textColorCss",
                            value
                        );
                    });
                });
            textColorSetting.descEl.empty();
            textColorSetting.descEl.createSpan({
                text: "行の横に表示する文字の色をCSS形式で指定します。",
            });
            textColorSetting.descEl.createEl("br");
            textColorSetting.descEl.createEl("br");
            textColorSetting.descEl.createSpan({
                text: "テーマの変更に自動で対応するため、テーマで定義された",
            });
            textColorSetting.descEl.createEl("a", {
                text: "CSS変数",
                href: "https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties",
            });
            textColorSetting.descEl.createSpan({
                text: "の使用を推奨します（例：",
            });
            textColorSetting.descEl.createEl("pre", {
                text: "var(--text-muted)",
                attr: {
                    style: "display:inline",
                },
            });
            textColorSetting.descEl.createSpan({ text: "、" });
            textColorSetting.descEl.createEl("pre", {
                text: "var(--text-on-accent)",
                attr: {
                    style: "display:inline",
                },
            });
            textColorSetting.descEl.createSpan({
                text: "）。",
            });
            textColorSetting.descEl.createEl("br");
            textColorSetting.descEl.createEl("br");
            textColorSetting.descEl.createSpan({ text: "参照：" });
            textColorSetting.descEl.createEl("a", {
                text: "Obsidianで使用できるCSS変数の一覧",
                href: "https://github.com/obsidian-community/obsidian-theme-template/blob/main/obsidian.css",
            });

            const ignoreWhitespaceSetting = new Setting(this.containerEl)
                .setName("変更の検出で空白と改行を無視")
                .addToggle((tgl) => {
                    tgl.setValue(this.settings.lineAuthor.ignoreWhitespace);
                    tgl.onChange((value) =>
                        this.lineAuthorSettingHandler("ignoreWhitespace", value)
                    );
                });
            ignoreWhitespaceSetting.descEl.empty();
            ignoreWhitespaceSetting.descEl.createSpan({
                text: "初期設定では、空白と改行も文書の一部として変更を検出します。そのため、末尾に行を追加すると、それまでの最終行のテキストが同じでも「変更あり」と表示されます。",
            });
            ignoreWhitespaceSetting.descEl.createEl("br");
            ignoreWhitespaceSetting.descEl.createSpan({
                text: "リストの階層や引用の字下げなど、空白だけの変更を検出する必要がない場合は、この設定を有効にすると本文の変更を確認しやすくなります。",
            });
        }
    }

    private createColorSetting(which: "oldest" | "newest") {
        const setting = new Setting(this.containerEl)
            .setName("")
            .addText((text) => {
                const color = pickColor(which, this.settings.lineAuthor);
                const defaultColor = pickColor(
                    which,
                    DEFAULT_SETTINGS.lineAuthor
                );
                text.setPlaceholder(rgbToString(defaultColor));
                text.setValue(rgbToString(color));
                text.onChange(async (colorNew) => {
                    const rgb = convertToRgb(colorNew);
                    if (rgb !== undefined) {
                        const key =
                            which === "newest" ? "colorNew" : "colorOld";
                        await this.lineAuthorSettingHandler(key, rgb);
                    }
                    this.refreshColorSettingsDesc(which, rgb);
                });
            });
        this.lineAuthorColorSettings.set(which, setting);

        this.refreshColorSettingsName(which);
        this.refreshColorSettingsDesc(
            which,
            pickColor(which, this.settings.lineAuthor)
        );
    }

    private refreshColorSettingsName(which: "oldest" | "newest") {
        const settingsDom = this.lineAuthorColorSettings.get(which);
        if (settingsDom) {
            const whichDescriber =
                which === "oldest"
                    ? `最も古い（「${this.settings.lineAuthor.coloringMaxAge}」以上前の）`
                    : "最新の";
            settingsDom.nameEl.setText(`${whichDescriber}コミットの色`);
        }
    }

    private refreshColorSettingsDesc(which: "oldest" | "newest", rgb?: RGB) {
        const settingsDom = this.lineAuthorColorSettings.get(which);
        if (settingsDom) {
            this.colorSettingPreviewDesc(
                settingsDom.descEl,
                which,
                this.settings.lineAuthor,
                rgb !== undefined
            );
        }
    }

    private colorSettingPreviewDesc(
        descEl: HTMLElement,
        which: "oldest" | "newest",
        laSettings: LineAuthorSettings,
        colorIsValid: boolean
    ): void {
        descEl.empty();
        descEl.createSpan({
            text: "「rgb(r,g,b)」「hsl(h,s,l)」、16進数（#）、色名（「black」「purple」など）を指定できます。色のプレビュー：",
        });

        const rgbStr = colorIsValid
            ? previewColor(which, laSettings)
            : `rgba(127,127,127,0.3)`;
        const today = moment.unix(moment.now() / 1000).format("YYYY-MM-DD");
        const text = colorIsValid ? `abcdef 作成者名 ${today}` : "無効な色";

        descEl.createEl("div", {
            text: text,
            attr: {
                class: "line-author-settings-preview",
                style: `background-color: ${rgbStr}; width: 30ch;`,
            },
        });
    }

    private setCustomDateTimeDescription(
        descEl: HTMLElement,
        dateTimeFormatCustomString: string
    ): void {
        descEl.empty();
        descEl.createEl("a", {
            text: "書式文字列",
            href: FORMAT_STRING_REFERENCE_URL,
        });
        descEl.createSpan({
            text: "で作成日時の表示形式を指定する。",
        });
        descEl.createEl("br");
        const formattedDateTime = moment().format(dateTimeFormatCustomString);
        descEl.createSpan({
            text: `現在の表示：「${formattedDateTime}」`,
        });
    }

    private setOldestAgeDescription(
        descEl: HTMLElement,
        coloringMaxAge: string
    ): void {
        const duration = parseColoringMaxAgeDuration(coloringMaxAge);
        const durationString =
            duration !== undefined ? `${duration.asDays()}日` : "無効な値";
        descEl.empty();
        descEl.createSpan({
            text: `行の作成者情報を色分けする経過時間の上限です。それより古い行は同じ色になります。最小値は「1d」です。現在の値：「${durationString}」。`,
        });
    }

    /**
     * Sets the value in the textbox for a given setting only if the saved value differs from the default value.
     * If the saved value is the default value, it probably wasn't defined by the user, so it's better to display it as a placeholder.
     */
    private setNonDefaultValue({
        settingsProperty,
        text,
    }: {
        settingsProperty: keyof ObsidianGitSettings;
        text: TextComponent | TextAreaComponent;
    }): void {
        const storedValue = this.plugin.settings[settingsProperty];
        const defaultValue = DEFAULT_SETTINGS[settingsProperty];

        if (defaultValue !== storedValue) {
            // Doesn't add "" to saved strings
            if (
                typeof storedValue === "string" ||
                typeof storedValue === "number" ||
                typeof storedValue === "boolean"
            ) {
                text.setValue(String(storedValue));
            } else {
                text.setValue(JSON.stringify(storedValue));
            }
        }
    }

    /**
     * Delays the update of the settings UI.
     * Used when the user toggles one of the settings that control enabled states of other settings. Delaying the update
     * allows most of the toggle animation to run, instead of abruptly jumping between enabled/disabled states.
     */
    private refreshDisplayWithDelay(timeout = 80): void {
        window.setTimeout(() => this.display(), timeout);
    }
}

export function pickColor(
    which: "oldest" | "newest",
    las: LineAuthorSettings
): RGB {
    return which === "oldest" ? las.colorOld : las.colorNew;
}

export function parseColoringMaxAgeDuration(
    durationString: string
): moment.Duration | undefined {
    // https://momentjs.com/docs/#/durations/creating/
    const duration = moment.duration("P" + durationString.toUpperCase());
    return duration.isValid() && duration.asDays() && duration.asDays() >= 1
        ? duration
        : undefined;
}
