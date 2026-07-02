import * as assert from 'assert';
import { parseMap, validateMap, serializeMap, parseMapSize } from '../mapEditor/mapModel';
import { PixelMapData } from '../mapEditor/types';

function validMap(overrides: Partial<PixelMapData> = {}): PixelMapData {
  return {
    format: 'pixel-vscode-map',
    version: 1,
    name: 'TestMap',
    tileSet: 'res://tileset.tres',
    output: 'res://map.tscn',
    width: 4,
    height: 4,
    tileSize: 16,
    layers: [{ name: 'Ground', zIndex: 0, cells: [] }],
    ...overrides
  };
}

suite('mapModel', () => {
  suite('validateMap', () => {
    test('accepts a well-formed map', () => {
      assert.doesNotThrow(() => validateMap(validMap()));
    });

    test('rejects wrong format', () => {
      assert.throws(() => validateMap(validMap({ format: 'other' as 'pixel-vscode-map' })), /Unsupported pixel map format/);
    });

    test('rejects wrong version', () => {
      assert.throws(() => validateMap(validMap({ version: 2 as 1 })), /Unsupported pixel map format/);
    });

    test('rejects missing name', () => {
      assert.throws(() => validateMap(validMap({ name: '' })), /name, TileSet, and output path/);
    });

    test('rejects tileSet without res:// prefix', () => {
      assert.throws(() => validateMap(validMap({ tileSet: 'tileset.tres' })), /name, TileSet, and output path/);
    });

    test('rejects output without res:// prefix', () => {
      assert.throws(() => validateMap(validMap({ output: 'map.tscn' })), /name, TileSet, and output path/);
    });

    test('rejects non-integer width', () => {
      assert.throws(() => validateMap(validMap({ width: 4.5 })), /positive integers/);
    });

    test('rejects zero or negative dimensions', () => {
      assert.throws(() => validateMap(validMap({ width: 0 })), /positive integers/);
      assert.throws(() => validateMap(validMap({ height: -1 })), /positive integers/);
    });

    test('rejects empty layers array', () => {
      assert.throws(() => validateMap(validMap({ layers: [] })), /at least one layer/);
    });

    test('rejects non-array layers', () => {
      assert.throws(() => validateMap(validMap({ layers: undefined as unknown as [] })), /at least one layer/);
    });

    test('rejects a layer missing a name', () => {
      assert.throws(
        () => validateMap(validMap({ layers: [{ name: '', zIndex: 0, cells: [] }] })),
        /name and cells array/
      );
    });

    test('rejects a layer whose cells is not an array', () => {
      assert.throws(
        () => validateMap(validMap({ layers: [{ name: 'Ground', zIndex: 0, cells: undefined as unknown as [] }] })),
        /name and cells array/
      );
    });
  });

  suite('parseMap', () => {
    test('parses valid JSON bytes into a map', () => {
      const map = validMap();
      const bytes = new TextEncoder().encode(JSON.stringify(map));
      assert.deepStrictEqual(parseMap(bytes), map);
    });

    test('throws on malformed JSON', () => {
      const bytes = new TextEncoder().encode('{not json');
      assert.throws(() => parseMap(bytes));
    });

    test('throws when parsed JSON fails validation', () => {
      const bytes = new TextEncoder().encode(JSON.stringify(validMap({ layers: [] })));
      assert.throws(() => parseMap(bytes), /at least one layer/);
    });
  });

  suite('serializeMap', () => {
    test('round-trips through parseMap', () => {
      const map = validMap();
      const bytes = new TextEncoder().encode(serializeMap(map));
      assert.deepStrictEqual(parseMap(bytes), map);
    });

    test('produces pretty-printed JSON terminated with a newline', () => {
      const text = serializeMap(validMap());
      assert.ok(text.endsWith('\n'));
      assert.ok(text.includes('\n  '), 'expected indented JSON');
    });
  });

  suite('parseMapSize', () => {
    test('parses a simple WxH string', () => {
      assert.deepStrictEqual(parseMapSize('16x32'), { width: 16, height: 32 });
    });

    test('is case-insensitive and tolerates surrounding whitespace', () => {
      assert.deepStrictEqual(parseMapSize('  8X8  '), { width: 8, height: 8 });
    });

    test('tolerates spaces around the separator', () => {
      assert.deepStrictEqual(parseMapSize('8 x 8'), { width: 8, height: 8 });
    });

    test('rejects malformed strings', () => {
      assert.strictEqual(parseMapSize('abc'), undefined);
      assert.strictEqual(parseMapSize('8'), undefined);
      assert.strictEqual(parseMapSize('8x'), undefined);
      assert.strictEqual(parseMapSize(''), undefined);
    });

    test('rejects zero and out-of-range dimensions', () => {
      assert.strictEqual(parseMapSize('0x8'), undefined);
      assert.strictEqual(parseMapSize('129x8'), undefined);
      assert.strictEqual(parseMapSize('8x129'), undefined);
    });

    test('accepts boundary values 1 and 128', () => {
      assert.deepStrictEqual(parseMapSize('1x128'), { width: 1, height: 128 });
      assert.deepStrictEqual(parseMapSize('128x1'), { width: 128, height: 1 });
    });
  });
});
