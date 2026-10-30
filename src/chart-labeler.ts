import { App, FileSystemAdapter, Notice, Platform, TFile } from 'obsidian';

const running = new Map<string, Promise<void>>();

/** Local research-vault integration. Arguments are passed without a shell. */
export function openChartLabeler(app: App, file: TFile): Promise<void> {
    const previous = running.get(file.path);
    if (previous) return previous;
    const task = launch(app, file).finally(() => running.delete(file.path));
    running.set(file.path, task);
    return task;
}

async function launch(app: App, file: TFile) {
    if (!Platform.isDesktopApp || !(app.vault.adapter instanceof FileSystemAdapter)) {
        new Notice('Chart labeling requires the desktop app and local research tools.');
        return;
    }
    const path = require('path') as typeof import('path');
    const fs = require('fs') as typeof import('fs');
    const { execFile } = require('child_process') as typeof import('child_process');
    const vault = app.vault.adapter.getBasePath();
    const script = path.resolve(vault, '..', 'Tools', 'research', 'chart-labeler', 'open.js');
    if (!fs.existsSync(script)) {
        new Notice('Chart tools not found beside this vault: Tools/research/chart-labeler/open.js');
        return;
    }
    const notice = new Notice('Preparing chart candidates… This may take several minutes.', 0);
    try {
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile('node', [script, path.join(vault, file.path), vault],
                { windowsHide: true, maxBuffer: 32e6 }, (error, stdout, stderr) => {
                    if (error) reject(new Error(stderr || error.message));
                    else resolve(stdout);
                });
        });
        const result = JSON.parse(stdout.trim());
        if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(result.url)) throw new Error('Invalid workspace URL');
        await require('electron').shell.openExternal(result.url);
        new Notice('Chart workspace ready. The paper’s Files links have been refreshed.');
    } catch (error) {
        console.error('Chart labeling failed', error);
        new Notice(`Chart preparation failed: ${error instanceof Error ? error.message.slice(0, 300) : error}`, 12000);
    } finally {
        notice.hide();
    }
}
