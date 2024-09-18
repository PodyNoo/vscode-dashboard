
"use strict";

import * as vscode from 'vscode';
import BaseService from './baseService';
import { Project } from '../models';
import * as path from 'path';

export interface IRecent {
	fsPath: string;
	name: string;
}

const GLOBAL_STATE_RECENT_KEY = 'recentList';

export default class RecentService extends BaseService {
    constructor(context: vscode.ExtensionContext) {
        super(context);
        this.refreshRecentlyOpened();
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

    private async addToRecentlyOpened(uri: vscode.Uri, name?: string): Promise<void> {
        if (name === undefined) {
            name = path.basename(uri.fsPath);
        }
        const recents = this.getRecentlyOpened();
        if (recents.findIndex(folder => folder.fsPath === uri.fsPath) === -1) {
            if (await this.pathExists(uri)) {
                recents.push({ fsPath: uri.fsPath, name: name });
                await this.updateRecentlyOpened(recents);
            }
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
}