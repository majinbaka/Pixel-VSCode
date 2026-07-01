import * as path from 'path';
import * as vscode from 'vscode';

export async function confirmOverwrite(uri: vscode.Uri): Promise<'overwrite' | 'saveas' | 'cancel'> {
  let exists = false;
  try {
    await vscode.workspace.fs.stat(uri);
    exists = true;
  } catch {
    exists = false;
  }

  if (!exists) {
    return 'overwrite';
  }

  const answer = await vscode.window.showWarningMessage(
    `"${path.basename(uri.fsPath)}" already exists. Overwrite the original file?`,
    { modal: true },
    'Overwrite',
    'Save as new file'
  );

  if (answer === 'Overwrite') {
    return 'overwrite';
  }
  if (answer === 'Save as new file') {
    return 'saveas';
  }
  return 'cancel';
}

export async function pickNonConflictingUri(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
  const dir = path.dirname(uri.fsPath);
  const base = path.basename(uri.fsPath, '.png');
  let candidate: vscode.Uri;
  let counter = 1;
  do {
    candidate = vscode.Uri.file(path.join(dir, `${base}_${counter}.png`));
    counter++;
    try {
      await vscode.workspace.fs.stat(candidate);
    } catch {
      break;
    }
  } while (counter < 1000);
  return candidate;
}
