import * as vscode from 'vscode';
import { findGodotProjectRoot, runGodotMapExporter } from '../godotProject';
import { MapDocument } from './mapDocument';
import { parseMap } from './mapModel';

export async function exportMap(context: vscode.ExtensionContext, document: MapDocument): Promise<void> {
  try {
    const map = parseMap(document.data);
    const projectRoot = findGodotProjectRoot(document.uri);
    if (!projectRoot) {
      throw new Error('Could not locate project.godot.');
    }
    await vscode.commands.executeCommand('workbench.action.files.save');
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Exporting ${map.output}`,
      cancellable: false
    }, async () => {
      await runGodotMapExporter(context, projectRoot, document.uri.fsPath, map.output);
    });
    vscode.window.showInformationMessage(`Map exported as native Godot scene: ${map.output}`);
  } catch (error) {
    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}
