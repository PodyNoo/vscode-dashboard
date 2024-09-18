
"use strict";

import * as vscode from 'vscode';
import BaseService from './baseService';
import { Project } from '../models';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface IRecent {
	fsPath: string;
	name: string;
}

const GLOBAL_STATE_RECENT_KEY = 'recentList';
const RECENTLY_CHANGED_EMIT = 'recentListChanged';
const DEBOUNCE_MS = 300;

export default class RecentService extends BaseService {
    private _recentlyChangedEmitter: EventEmitter;

    constructor(context: vscode.ExtensionContext) {
        super(context);
        this._recentlyChangedEmitter = new EventEmitter();
        this.refreshRecentlyOpened();
        this.initWatchForChanges();
    }

    public getRecentlyOpened(): IRecent[] {
        return this.context.globalState.get<IRecent[]>(GLOBAL_STATE_RECENT_KEY, []);
    }

    public async refreshRecentlyOpened(onlyFiles: boolean = false) {
        const showRecentGroup: boolean = this.configurationSection.get('showRecentGroup');
        if (!showRecentGroup) {
            return;
        }

        // Add external files
        for (let fileUri of this.GetFilesExternalToTheWorkspace()) {
            this.addToRecentlyOpened(fileUri);
        }
        if (onlyFiles) {
            return;
        }

        // Add folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            for (let folder of workspaceFolders) {
                this.addToRecentlyOpened(folder.uri, folder.name);
            }
        }
    }

    public async removeProjectFromRecentlyOpened(project: Project): Promise<void> {
        const recents = this.getRecentlyOpened();
        const projectIndex = recents.findIndex(folder => folder.fsPath.trim() === project.path.trim());
        if (projectIndex > -1) {
            recents.splice(projectIndex, 1);
            await this.updateRecentlyOpened(recents);
        }
    }

    public async resetRecentlyOpened(): Promise<void> {
        await this.updateRecentlyOpened([]);
    }

    public onDidRecentlyOpenedChanged(listener: () => void): vscode.Disposable {
        this._recentlyChangedEmitter.on(RECENTLY_CHANGED_EMIT, listener);
        return { 
            dispose: () => {
                this._recentlyChangedEmitter.off(RECENTLY_CHANGED_EMIT, listener);
            }
        };
    }

    private async addToRecentlyOpened(uri: vscode.Uri, name?: string): Promise<void> {
        let recentlyOpenedHasChanged = false;
        if (name === undefined) {
            name = path.basename(uri.fsPath);
        }
        const recents = this.getRecentlyOpened();
        if (recents.findIndex(folder => folder.fsPath === uri.fsPath) === -1) {
            if (await this.pathExists(uri)) {
                recents.push({ fsPath: uri.fsPath, name: name });
                await this.updateRecentlyOpened(recents);
                recentlyOpenedHasChanged = true;
            }
        }
        if (recentlyOpenedHasChanged) {
            this._recentlyChangedEmitter.emit(RECENTLY_CHANGED_EMIT);
        }
    }

    private async updateRecentlyOpened(recents: IRecent[]): Promise<void> {
        await this.context.globalState.update(GLOBAL_STATE_RECENT_KEY, recents);
    }

    private async pathExists(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return (stat.type === vscode.FileType.Directory) || (stat.type === vscode.FileType.File);
        } catch (error) {
            return false;
        }
    }

    private GetFilesExternalToTheWorkspace(): vscode.Uri[] {
        const externalFiles: vscode.Uri[] = [];
        const tabs = vscode.window.tabGroups.all.map(tab => tab.tabs).flat();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        let workspaceRoot: vscode.WorkspaceFolder;
        if (workspaceFolders && workspaceFolders.length > 0) {
            workspaceRoot = workspaceFolders[0];
        }

        for (let tab of tabs) {
            if (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputNotebook) {
                if (tab.input.uri.scheme === "untitled" || !tab.input.uri.scheme) {
                    continue;
                }
                if (!workspaceRoot || vscode.workspace.getWorkspaceFolder(tab.input.uri) === undefined) {
                    externalFiles.push(tab.input.uri);
                }
            }
        }

        return externalFiles;
    }

    private initWatchForChanges() {
        let refreshRecentlyOpenedTimeoutId = null;
        let refreshRecentlyOpenedFilesTimeoutId = null;

        this.context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            clearTimeout(refreshRecentlyOpenedTimeoutId);
            if (refreshRecentlyOpenedFilesTimeoutId !== null) {
                clearTimeout(refreshRecentlyOpenedFilesTimeoutId);
            }
            refreshRecentlyOpenedTimeoutId = setTimeout(async () => {
                await this.refreshRecentlyOpened();
                refreshRecentlyOpenedTimeoutId = null;
            }, DEBOUNCE_MS);
        }));

        this.context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(async() => {
            clearTimeout(refreshRecentlyOpenedFilesTimeoutId);
            if (refreshRecentlyOpenedTimeoutId === null) {
                refreshRecentlyOpenedFilesTimeoutId = setTimeout(async () => {
                    await this.refreshRecentlyOpened(true);
                    refreshRecentlyOpenedFilesTimeoutId = null;
                }, DEBOUNCE_MS);
            } else {
                refreshRecentlyOpenedFilesTimeoutId = null;
            }
        }));
    }
}