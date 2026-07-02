import * as assert from 'assert';
import * as vscode from 'vscode';
import { MapDocument } from '../mapEditor/mapDocument';

function makeUri(): vscode.Uri {
  return vscode.Uri.file('/tmp/pixel-vscode-mapdoc-test.pixelmap.json');
}

suite('MapDocument', () => {
  test('constructor exposes the initial bytes', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const doc = new MapDocument(makeUri(), bytes);
    assert.strictEqual(doc.data, bytes);
  });

  test('update replaces bytes and fires onDidChangeContent by default', () => {
    const doc = new MapDocument(makeUri(), new Uint8Array([0]));
    const newBytes = new Uint8Array([9, 9]);

    let fireCount = 0;
    doc.onDidChangeContent(() => {
      fireCount += 1;
    });

    doc.update(newBytes);

    assert.strictEqual(doc.data, newBytes);
    assert.strictEqual(fireCount, 1);
  });

  test('update with notify=false replaces bytes without firing the event', () => {
    const doc = new MapDocument(makeUri(), new Uint8Array([0]));
    const newBytes = new Uint8Array([7]);

    let fireCount = 0;
    doc.onDidChangeContent(() => {
      fireCount += 1;
    });

    doc.update(newBytes, false);

    assert.strictEqual(doc.data, newBytes);
    assert.strictEqual(fireCount, 0);
  });

  test('update is a no-op after dispose', () => {
    const originalBytes = new Uint8Array([5]);
    const doc = new MapDocument(makeUri(), originalBytes);
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
    const doc = new MapDocument(makeUri(), new Uint8Array());
    doc.dispose();
    assert.doesNotThrow(() => doc.dispose());
  });
});
