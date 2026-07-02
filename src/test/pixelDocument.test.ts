import * as assert from 'assert';
import * as vscode from 'vscode';
import { PixelDocument } from '../pixelEditor/pixelDocument';
import { LayerStateFile } from '../layerState';

function makeUri(): vscode.Uri {
  return vscode.Uri.file('/tmp/pixel-vscode-doc-test.png');
}

suite('PixelDocument', () => {
  test('constructor exposes the initial bytes and layer state', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const layerState: LayerStateFile = { layers: [] };
    const doc = new PixelDocument(makeUri(), bytes, layerState);

    assert.strictEqual(doc.data, bytes);
    assert.strictEqual(doc.currentLayerState, layerState);
  });

  test('layer state defaults to undefined when not provided', () => {
    const doc = new PixelDocument(makeUri(), new Uint8Array());
    assert.strictEqual(doc.currentLayerState, undefined);
  });

  test('update replaces bytes and layer state and fires onDidChangeContent', () => {
    const doc = new PixelDocument(makeUri(), new Uint8Array([0]));
    const newBytes = new Uint8Array([9, 9]);
    const newLayerState: LayerStateFile = { layers: [] };

    let firedWith: vscode.WebviewPanel | undefined = undefined;
    let fireCount = 0;
    doc.onDidChangeContent((panel) => {
      fireCount += 1;
      firedWith = panel;
    });

    doc.update(newBytes, newLayerState);

    assert.strictEqual(doc.data, newBytes);
    assert.strictEqual(doc.currentLayerState, newLayerState);
    assert.strictEqual(fireCount, 1);
    assert.strictEqual(firedWith, undefined);
  });

  test('update forwards the source panel to onDidChangeContent listeners', () => {
    const doc = new PixelDocument(makeUri(), new Uint8Array());
    const fakeSource = { title: 'fake' } as unknown as vscode.WebviewPanel;

    let received: vscode.WebviewPanel | undefined;
    doc.onDidChangeContent((panel) => {
      received = panel;
    });

    doc.update(new Uint8Array([1]), undefined, fakeSource);

    assert.strictEqual(received, fakeSource);
  });

  test('update is a no-op after dispose', () => {
    const originalBytes = new Uint8Array([5]);
    const doc = new PixelDocument(makeUri(), originalBytes);
    doc.dispose();

    let fired = false;
    doc.onDidChangeContent(() => {
      fired = true;
    });

    doc.update(new Uint8Array([6]));

    assert.strictEqual(doc.data, originalBytes);
    assert.strictEqual(fired, false);
  });

  test('dispose does not throw when called multiple times', () => {
    const doc = new PixelDocument(makeUri(), new Uint8Array());
    doc.dispose();
    assert.doesNotThrow(() => doc.dispose());
  });
});
