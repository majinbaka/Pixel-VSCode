import * as assert from 'assert';
import { PNG } from 'pngjs';
import { composeSpriteSheet, decodeFrames } from '../pixelEditor/spriteSheetExport';
import { AnimationLayerFrame } from '../shared/types';

function solidColorPngDataUri(width: number, height: number, rgba: [number, number, number, number]): string {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgba[0];
    png.data[i * 4 + 1] = rgba[1];
    png.data[i * 4 + 2] = rgba[2];
    png.data[i * 4 + 3] = rgba[3];
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

function pixelAt(png: PNG, x: number, y: number): [number, number, number, number] {
  const idx = (png.width * y + x) * 4;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]];
}

suite('spriteSheetExport', () => {
  test('decodeFrames decodes each frame data URI into a PNG buffer with matching name', () => {
    const frames: AnimationLayerFrame[] = [
      { name: 'Base', dataUri: solidColorPngDataUri(2, 2, [255, 0, 0, 255]) },
      { name: 'Top', dataUri: solidColorPngDataUri(2, 2, [0, 255, 0, 255]) }
    ];

    const decoded = decodeFrames(frames);
    assert.strictEqual(decoded.length, 2);
    assert.strictEqual(decoded[0].name, 'Base');
    assert.strictEqual(decoded[1].name, 'Top');
    assert.deepStrictEqual(pixelAt(decoded[0].png, 0, 0), [255, 0, 0, 255]);
    assert.deepStrictEqual(pixelAt(decoded[1].png, 0, 0), [0, 255, 0, 255]);
  });

  test('composeSpriteSheet lays a single frame out as a 1x1 grid', () => {
    const frames = decodeFrames([{ name: 'Only', dataUri: solidColorPngDataUri(3, 3, [10, 20, 30, 255]) }]);
    const { png, layout } = composeSpriteSheet(frames);

    assert.deepStrictEqual(layout, { columns: 1, rows: 1, frameWidth: 3, frameHeight: 3 });
    assert.strictEqual(png.width, 3);
    assert.strictEqual(png.height, 3);
    assert.deepStrictEqual(pixelAt(png, 0, 0), [10, 20, 30, 255]);
  });

  test('composeSpriteSheet arranges two frames side by side in a 2x1 grid', () => {
    const frames = decodeFrames([
      { name: 'Left', dataUri: solidColorPngDataUri(2, 2, [255, 0, 0, 255]) },
      { name: 'Right', dataUri: solidColorPngDataUri(2, 2, [0, 0, 255, 255]) }
    ]);
    const { png, layout } = composeSpriteSheet(frames);

    assert.deepStrictEqual(layout, { columns: 2, rows: 1, frameWidth: 2, frameHeight: 2 });
    assert.strictEqual(png.width, 4);
    assert.strictEqual(png.height, 2);
    assert.deepStrictEqual(pixelAt(png, 0, 0), [255, 0, 0, 255]);
    assert.deepStrictEqual(pixelAt(png, 2, 0), [0, 0, 255, 255]);
  });

  test('composeSpriteSheet leaves unfilled trailing cells transparent when frame count does not fill the grid', () => {
    const frames = decodeFrames([
      { name: 'A', dataUri: solidColorPngDataUri(1, 1, [255, 255, 255, 255]) },
      { name: 'B', dataUri: solidColorPngDataUri(1, 1, [255, 255, 255, 255]) },
      { name: 'C', dataUri: solidColorPngDataUri(1, 1, [255, 255, 255, 255]) }
    ]);
    const { png, layout } = composeSpriteSheet(frames);

    // ceil(sqrt(3)) = 2 columns, ceil(3/2) = 2 rows -> one trailing empty cell.
    assert.deepStrictEqual(layout, { columns: 2, rows: 2, frameWidth: 1, frameHeight: 1 });
    assert.deepStrictEqual(pixelAt(png, 0, 0), [255, 255, 255, 255]);
    assert.deepStrictEqual(pixelAt(png, 1, 0), [255, 255, 255, 255]);
    assert.deepStrictEqual(pixelAt(png, 0, 1), [255, 255, 255, 255]);
    assert.deepStrictEqual(pixelAt(png, 1, 1), [0, 0, 0, 0]);
  });

  test('composeSpriteSheet throws when given no frames', () => {
    assert.throws(() => composeSpriteSheet([]), /No frames to export/);
  });
});
