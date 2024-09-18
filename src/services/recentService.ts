
"use strict";

import * as vscode from 'vscode';
import BaseService from './baseService';
import { Project } from '../models';
import * as path from 'path';

export interface IRecentFolder {
	fsPath: string;
	name: string;
}

export default class RecentService extends BaseService {
    constructor(context: vscode.ExtensionContext) {
        super(context);
        this.refreshRecentlyOpened();
    }

    public getRecentlyOpened(): IRecentFolder[] {
        const recentFolders = this.context.globalState.get<IRecentFolder[]>('recentFolders', []);
        return recentFolders;
    }

    public async addToRecentlyOpened(uri: vscode.Uri, name?: string): Promise<void> {
        if (name === undefined) {
            name = path.basename(uri.fsPath);
        }
        const recentFolders = this.getRecentlyOpened();
        if (recentFolders.findIndex(folder => folder.fsPath === uri.fsPath) === -1) {
            if (await this.pathExists(uri)) {
                recentFolders.push({ fsPath: uri.fsPath, name: name });
                await this.updateRecentlyOpened(recentFolders);
            }
        }
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
        const currentFolders = vscode.workspace.workspaceFolders;
        if (currentFolders && currentFolders.length > 0) {
            for (let folder of currentFolders) {
                this.addToRecentlyOpened(folder.uri, folder.name);
            }
        }
    }


    public async updateRecentlyOpened(recentFolders: IRecentFolder[]): Promise<void> {
        await this.context.globalState.update('recentFolders', recentFolders);
    }

    public async removeProjectFromRecentlyOpened(project: Project): Promise<void> {
        const recentFolders = this.getRecentlyOpened();
        const recentFolderIndex = recentFolders.findIndex(folder => folder.fsPath.trim() === project.path.trim());
        if (recentFolderIndex > -1) {
            recentFolders.splice(recentFolderIndex, 1);
            await this.updateRecentlyOpened(recentFolders);
        }
    }

    public async openFolder(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Open Folder'
        });

        if (result && result.length > 0) {
            const folderUri = result[0];
            try {
                await vscode.commands.executeCommand('vscode.openFolder', folderUri);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open folder: ${error.message}`);
            }
        }
    }

    public async pathExists(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return (stat.type === vscode.FileType.Directory) || (stat.type === vscode.FileType.File);
        } catch (error) {
            return false;
        }
    }

    public GetFilesExternalToTheWorkspace(): vscode.Uri[] {
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