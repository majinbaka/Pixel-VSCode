import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PNG } from 'pngjs';

const EXTENSION_ID = 'majinbaka.pixel-vscode';
const EXPECTED_COMMANDS = [
  'pixelVscode.newFile',
  'pixelVscode.openEditor',
  'pixelVscode.previewAnimation',
  'pixelVscode.newGodotMap'
];

suite('Pixel VSCode smoke tests', () => {
  test('extension activates', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, 'extension should be found by id');
    await extension!.activate();
    assert.ok(extension!.isActive, 'extension should be active');
  });

  test('all commands are registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of EXPECTED_COMMANDS) {
      assert.ok(commands.includes(command), `expected command "${command}" to be registered`);
    }
  });

  test('opening a PNG with the Pixel Editor does not throw', async () => {
    const png = new PNG({ width: 4, height: 4 });
    const filePath = path.join(os.tmpdir(), `pixel-vscode-smoke-${Date.now()}.png`);
    const uri = vscode.Uri.file(filePath);
    await vscode.workspace.fs.writeFile(uri, PNG.sync.write(png));

    await vscode.commands.executeCommand('vscode.openWith', uri, 'pixelVscode.pixelEditor');

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(uri);
  });
});
