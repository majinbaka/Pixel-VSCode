import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  collisionResourceUri,
  readCollisionPolygon,
  writeCollisionPolygon,
  deleteCollisionPolygon
} from '../collisionShape';

suite('collisionShape', () => {
  let pngUri: vscode.Uri;

  setup(() => {
    const filePath = path.join(os.tmpdir(), `pixel-vscode-collision-${Date.now()}-${Math.random()}.png`);
    pngUri = vscode.Uri.file(filePath);
  });

  teardown(async () => {
    await deleteCollisionPolygon(pngUri);
  });

  test('collisionResourceUri derives a sibling .collision.tres path', () => {
    const uri = collisionResourceUri(vscode.Uri.file('/some/dir/My Sprite.png'));
    assert.strictEqual(uri.fsPath, path.join('/some/dir', 'My Sprite.collision.tres'));
  });

  test('readCollisionPolygon returns undefined when no resource file exists', async () => {
    assert.strictEqual(await readCollisionPolygon(pngUri), undefined);
  });

  test('writeCollisionPolygon then readCollisionPolygon round-trips integer points', async () => {
    const points = [0, 0, 10, 0, 10, 10, 0, 10];
    await writeCollisionPolygon(pngUri, points);
    assert.deepStrictEqual(await readCollisionPolygon(pngUri), points);
  });

  test('writeCollisionPolygon formats non-integer values to two decimal places', async () => {
    await writeCollisionPolygon(pngUri, [0.5, 1.25, 2, 3]);
    const text = Buffer.from(await vscode.workspace.fs.readFile(collisionResourceUri(pngUri))).toString('utf8');
    assert.ok(text.includes('0.50, 1.25'), text);
    assert.ok(text.includes('2, 3'), text);
  });

  test('writeCollisionPolygon returns the resource uri it wrote to', async () => {
    const result = await writeCollisionPolygon(pngUri, [0, 0, 1, 1, 1, 0]);
    assert.strictEqual(result.fsPath, collisionResourceUri(pngUri).fsPath);
  });

  test('readCollisionPolygon returns undefined when the file has no points field', async () => {
    await vscode.workspace.fs.writeFile(
      collisionResourceUri(pngUri),
      new TextEncoder().encode('[gd_resource type="ConvexPolygonShape2D" format=3]\n\n[resource]\n')
    );
    assert.strictEqual(await readCollisionPolygon(pngUri), undefined);
  });

  test('readCollisionPolygon returns undefined for an odd number of coordinate values', async () => {
    await vscode.workspace.fs.writeFile(
      collisionResourceUri(pngUri),
      new TextEncoder().encode('points = PackedVector2Array(0, 0, 1, 1, 1)')
    );
    assert.strictEqual(await readCollisionPolygon(pngUri), undefined);
  });

  test('readCollisionPolygon returns undefined for fewer than 3 points (6 values)', async () => {
    await vscode.workspace.fs.writeFile(
      collisionResourceUri(pngUri),
      new TextEncoder().encode('points = PackedVector2Array(0, 0, 1, 1)')
    );
    assert.strictEqual(await readCollisionPolygon(pngUri), undefined);
  });

  test('readCollisionPolygon ignores non-numeric tokens within the array', async () => {
    await vscode.workspace.fs.writeFile(
      collisionResourceUri(pngUri),
      new TextEncoder().encode('points = PackedVector2Array(0, 0, 1, 1, foo, 1, 0)')
    );
    assert.deepStrictEqual(await readCollisionPolygon(pngUri), [0, 0, 1, 1, 1, 0]);
  });

  test('deleteCollisionPolygon removes the resource file', async () => {
    await writeCollisionPolygon(pngUri, [0, 0, 1, 1, 1, 0]);
    await deleteCollisionPolygon(pngUri);
    assert.strictEqual(await readCollisionPolygon(pngUri), undefined);
  });

  test('deleteCollisionPolygon does not throw when no resource file exists', async () => {
    await assert.doesNotReject(deleteCollisionPolygon(pngUri));
  });
});
