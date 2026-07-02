import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  layerStateResourceUri,
  readLayerState,
  writeLayerState,
  deleteLayerState,
  LayerStateFile
} from '../layerState';

function sampleState(): LayerStateFile {
  return {
    layers: [
      {
        id: 'layer-1',
        name: 'Base',
        visible: true,
        opacity: 1,
        dataUri: 'data:image/png;base64,AAAA',
        rig: { activePivotId: 'pivot-1', pivots: [{ id: 'pivot-1', name: 'root', x: 0, y: 0, angle: 0 }] }
      }
    ]
  };
}

suite('layerState', () => {
  let pngUri: vscode.Uri;

  setup(() => {
    const filePath = path.join(os.tmpdir(), `pixel-vscode-layerstate-${Date.now()}-${Math.random()}.png`);
    pngUri = vscode.Uri.file(filePath);
  });

  teardown(async () => {
    await deleteLayerState(pngUri);
  });

  test('layerStateResourceUri derives a hidden sidecar path next to the PNG', () => {
    const uri = layerStateResourceUri(vscode.Uri.file('/some/dir/My Image.png'));
    assert.strictEqual(uri.fsPath, path.join('/some/dir', '.My Image_image.pixvjson'));
  });

  test('readLayerState returns undefined when no sidecar file exists', async () => {
    const result = await readLayerState(pngUri);
    assert.strictEqual(result, undefined);
  });

  test('writeLayerState then readLayerState round-trips the data', async () => {
    const state = sampleState();
    await writeLayerState(pngUri, state);
    const result = await readLayerState(pngUri);
    assert.deepStrictEqual(result, state);
  });

  test('readLayerState returns undefined for malformed JSON', async () => {
    await vscode.workspace.fs.writeFile(layerStateResourceUri(pngUri), new TextEncoder().encode('{not json'));
    const result = await readLayerState(pngUri);
    assert.strictEqual(result, undefined);
  });

  test('readLayerState returns undefined when "layers" is not an array', async () => {
    await vscode.workspace.fs.writeFile(
      layerStateResourceUri(pngUri),
      new TextEncoder().encode(JSON.stringify({ layers: 'nope' }))
    );
    const result = await readLayerState(pngUri);
    assert.strictEqual(result, undefined);
  });

  test('readLayerState returns undefined for a JSON value with no layers field', async () => {
    await vscode.workspace.fs.writeFile(
      layerStateResourceUri(pngUri),
      new TextEncoder().encode(JSON.stringify({ foo: 'bar' }))
    );
    const result = await readLayerState(pngUri);
    assert.strictEqual(result, undefined);
  });

  test('deleteLayerState removes the sidecar file', async () => {
    await writeLayerState(pngUri, sampleState());
    await deleteLayerState(pngUri);
    const result = await readLayerState(pngUri);
    assert.strictEqual(result, undefined);
  });

  test('deleteLayerState does not throw when no sidecar file exists', async () => {
    await assert.doesNotReject(deleteLayerState(pngUri));
  });

  test('writeLayerState overwrites a previous sidecar file', async () => {
    await writeLayerState(pngUri, sampleState());
    const updated: LayerStateFile = { layers: [] };
    await writeLayerState(pngUri, updated);
    const result = await readLayerState(pngUri);
    assert.deepStrictEqual(result, updated);
  });
});
