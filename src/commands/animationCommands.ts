import * as path from 'path';
import * as vscode from 'vscode';
import { getAnimationHtml } from '../animationPreview/animationPreviewProvider';
import { AnimationFrameData, AnimationPreviewMessage } from '../animationPreview/types';

const ANIMATION_VIEW_TYPE = 'pixelVscode.animationPreview';

export async function openAnimationPreview(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
  selectedResources?: vscode.Uri[]
): Promise<void> {
  const selectedPngs = getPngUris(resource, selectedResources);
  const frameUris = selectedPngs.length >= 2 ? selectedPngs : await pickAnimationFrames();
  if (!frameUris || frameUris.length < 2) {
    vscode.window.showWarningMessage('Select at least two PNG files to preview an animation.');
    return;
  }

  const durationInput = await vscode.window.showInputBox({
    title: 'Pixel Animation Preview',
    prompt: `Frame duration in milliseconds. Enter one value for all ${frameUris.length} frames, or ${frameUris.length} comma-separated values.`,
    value: '120',
    validateInput(value) {
      return parseFrameDurations(value, frameUris.length)
        ? undefined
        : `Use one duration or exactly ${frameUris.length} comma-separated durations, from 20 to 10000 ms.`;
    }
  });

  if (!durationInput) {
    return;
  }

  const durations = parseFrameDurations(durationInput, frameUris.length);
  if (!durations) {
    return;
  }

  const frames = await readAnimationFrames(frameUris, durations);
  const panel = vscode.window.createWebviewPanel(
    ANIMATION_VIEW_TYPE,
    'Pixel Animation Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'media')
      ]
    }
  );

  panel.webview.html = getAnimationHtml(context, panel.webview);
  panel.webview.onDidReceiveMessage(async (message: AnimationPreviewMessage) => {
    switch (message.type) {
      case 'ready':
        panel.webview.postMessage({
          type: 'init',
          frames
        });
        return;

      case 'pickFrames':
        await replaceAnimationFrames(panel);
        return;
    }
  });
}

async function replaceAnimationFrames(panel: vscode.WebviewPanel): Promise<void> {
  const frameUris = await pickAnimationFrames();
  if (!frameUris || frameUris.length < 2) {
    return;
  }

  const durationInput = await vscode.window.showInputBox({
    title: 'Pixel Animation Preview',
    prompt: `Frame duration in milliseconds. Enter one value for all ${frameUris.length} frames, or ${frameUris.length} comma-separated values.`,
    value: '120',
    validateInput(value) {
      return parseFrameDurations(value, frameUris.length)
        ? undefined
        : `Use one duration or exactly ${frameUris.length} comma-separated durations, from 20 to 10000 ms.`;
    }
  });

  if (!durationInput) {
    return;
  }

  const durations = parseFrameDurations(durationInput, frameUris.length);
  if (!durations) {
    vscode.window.showWarningMessage(`Use one duration or exactly ${frameUris.length} comma-separated durations.`);
    return;
  }

  panel.webview.postMessage({
    type: 'init',
    frames: await readAnimationFrames(frameUris, durations)
  });
}

async function pickAnimationFrames(): Promise<vscode.Uri[] | undefined> {
  const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const uris = await vscode.window.showOpenDialog({
    title: 'Select PNG animation frames',
    defaultUri: defaultFolder,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    filters: {
      'PNG images': ['png']
    },
    openLabel: 'Preview Animation'
  });

  if (!uris?.length) {
    return undefined;
  }

  return dedupeAndSortPngUris(uris);
}

function getPngUris(resource?: vscode.Uri, selectedResources?: vscode.Uri[]): vscode.Uri[] {
  return dedupeAndSortPngUris([
    ...(resource ? [resource] : []),
    ...(selectedResources ?? [])
  ]);
}

function dedupeAndSortPngUris(uris: vscode.Uri[]): vscode.Uri[] {
  const byPath = new Map<string, vscode.Uri>();
  for (const uri of uris) {
    if (path.extname(uri.path).toLowerCase() === '.png') {
      byPath.set(uri.toString(), uri);
    }
  }

  return Array.from(byPath.values()).sort((first, second) => first.fsPath.localeCompare(second.fsPath, undefined, {
    numeric: true,
    sensitivity: 'base'
  }));
}

function parseFrameDurations(value: string, frameCount: number): number[] | undefined {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  const durations = parts.map((part) => Number(part));
  if (durations.some((duration) =>
    !Number.isInteger(duration) || duration < 20 || duration > 10000
  )) {
    return undefined;
  }

  if (durations.length === 1) {
    return Array.from({ length: frameCount }, () => durations[0]);
  }

  return durations.length === frameCount ? durations : undefined;
}

async function readAnimationFrames(uris: vscode.Uri[], durations: number[]): Promise<AnimationFrameData[]> {
  return Promise.all(uris.map(async (uri, index) => {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return {
      name: path.basename(uri.fsPath),
      path: uri.fsPath,
      duration: durations[index],
      dataUri: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
    };
  }));
}
