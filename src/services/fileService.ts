import BaseService from "./baseService";
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { ProjectPathType } from "../models";

export default class FileService extends BaseService {

    async removeFile(filePath: string): Promise<void> {
        filePath = path.normalize(filePath);
        await fs.promises.unlink(filePath);
    }

    async writeTextFile(filePath: string, data: string): Promise<void> {
        return this.writeFile(filePath, data);
    }

    async writeFile(filePath: string, data: any): Promise<void> {
        filePath = path.normalize(filePath);
        var dir = path.dirname(filePath);

        await new Promise<void>((resolve, reject) => {
            try {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir);
                }
                resolve();
            } catch (e) {
                reject(e);
            }
        });

        await fs.promises.writeFile(filePath, data, "utf8");
    }

    async getProjectPathType(p: string): Promise<ProjectPathType> {
        let stats = await fs.promises.lstat(p);
        if (stats.isDirectory()) {
            return ProjectPathType.Folder;
        }

        let isVSCodeWorkspaceFile = p.toLowerCase().endsWith(".code-workspace");
        return isVSCodeWorkspaceFile ? ProjectPathType.WorkspaceFile : ProjectPathType.File;
    }

    async getFoldersFromWorkspaceFile(p: string): Promise<string[]> {
        let content = await fs.promises.readFile(p, "utf8");
        let json = JSON.parse(content) as { folders: { path: string }[] };
        let folder = path.dirname(p);
        let folderPaths = json.folders.map(f => path.join(folder, f.path));
        return folderPaths;
    }

    async getFolders(p: string): Promise<string[]> {
        let files = await fs.promises.readdir(p);
        let filePaths = files.map(f => path.join(p, f));
        let stats = await Promise.all(filePaths.map(f => fs.promises.lstat(f)));
        let folders = filePaths.filter((f, i) => stats[i].isDirectory());
        return folders;
    }

    isFile(p: string): boolean {
        return !!path.extname(p);
    }

    public async newTextFile(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open folder: ${error.message}`);
        }
    }

    public async openDialog(type: ProjectPathType): Promise<void> {
        let dialogOption: vscode.OpenDialogOptions;
        let command: string;

        switch (type) {
            case ProjectPathType.File:
                dialogOption = {
                    canSelectFiles: true,
                    canSelectMany: true,
                    openLabel: 'Open File'
                };
                command = "vscode.open";
                break;
            case ProjectPathType.Folder:
                dialogOption = {
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Open Folder'
                };
                command = "vscode.openFolder";
                break;
            case ProjectPathType.WorkspaceFile:
                dialogOption = {
                    canSelectFiles: true,
                    canSelectMany: false,
                    filters: { 'Code Workspace': ['code-workspace'] },
                    openLabel: 'Open Workspace from File'
                };
                command = "vscode.openFolder";
                break;
        }

        const result = await vscode.window.showOpenDialog(dialogOption);
        if (result && result.length > 0) {
            const uri = result[0];
            try {
                await vscode.commands.executeCommand(command, uri);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to ${dialogOption.openLabel}: ${error.message}`);
            }
        }
    }
}