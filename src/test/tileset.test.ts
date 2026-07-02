import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import { parseTileSet } from '../mapEditor/tileset';

function writePng(filePath: string, width: number, height: number): void {
  const png = new PNG({ width, height });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

suite('tileset.parseTileSet', () => {
  let projectRoot: string;

  setup(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-vscode-tileset-'));
    fs.mkdirSync(path.join(projectRoot, 'assets', 'tiles'), { recursive: true });
  });

  teardown(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeTres(fileName: string, contents: string): string {
    const resourcePath = `res://assets/tiles/${fileName}`;
    fs.writeFileSync(path.join(projectRoot, 'assets', 'tiles', fileName), contents, 'utf8');
    return resourcePath;
  }

  test('parses tile size, atlas source, and PNG texture dimensions', async () => {
    writePng(path.join(projectRoot, 'assets', 'tiles', 'atlas.png'), 64, 32);
    const tres = `[gd_resource type="TileSet" load_steps=3 format=3]

[ext_resource type="Texture2D" path="res://assets/tiles/atlas.png" id="1"]

[sub_resource type="TileSetAtlasSource" id="1"]
texture = ExtResource("1")
texture_region_size = Vector2i(16, 16)

[resource]
tile_size = Vector2i(16, 16)
sources/0 = SubResource("1")
`;
    const resourcePath = writeTres('tileset.tres', tres);

    const result = await parseTileSet(projectRoot, resourcePath);

    assert.strictEqual(result.tileSize, 16);
    assert.strictEqual(result.sources.length, 1);
    assert.strictEqual(result.sources[0].sourceId, 0);
    assert.strictEqual(result.sources[0].name, 'atlas.png');
    assert.strictEqual(result.sources[0].regionWidth, 16);
    assert.strictEqual(result.sources[0].regionHeight, 16);
    assert.strictEqual(result.sources[0].columns, 4);
    assert.strictEqual(result.sources[0].rows, 2);
    assert.ok(result.sources[0].dataUri.startsWith('data:image/png;base64,'));
  });

  test('defaults tile size to 32 when tile_size is missing', async () => {
    writePng(path.join(projectRoot, 'assets', 'tiles', 'atlas.png'), 32, 32);
    const tres = `[gd_resource type="TileSet" load_steps=3 format=3]

[ext_resource type="Texture2D" path="res://assets/tiles/atlas.png" id="1"]

[sub_resource type="TileSetAtlasSource" id="1"]
texture = ExtResource("1")
texture_region_size = Vector2i(32, 32)

[resource]
sources/0 = SubResource("1")
`;
    const resourcePath = writeTres('tileset.tres', tres);

    const result = await parseTileSet(projectRoot, resourcePath);
    assert.strictEqual(result.tileSize, 32);
  });

  test('parses multiple atlas sources with matching sourceIds', async () => {
    writePng(path.join(projectRoot, 'assets', 'tiles', 'a.png'), 16, 16);
    writePng(path.join(projectRoot, 'assets', 'tiles', 'b.png'), 32, 16);
    const tres = `[gd_resource type="TileSet" load_steps=5 format=3]

[ext_resource type="Texture2D" path="res://assets/tiles/a.png" id="1"]
[ext_resource type="Texture2D" path="res://assets/tiles/b.png" id="2"]

[sub_resource type="TileSetAtlasSource" id="1"]
texture = ExtResource("1")
texture_region_size = Vector2i(16, 16)

[sub_resource type="TileSetAtlasSource" id="2"]
texture = ExtResource("2")
texture_region_size = Vector2i(16, 16)

[resource]
tile_size = Vector2i(16, 16)
sources/0 = SubResource("1")
sources/5 = SubResource("2")
`;
    const resourcePath = writeTres('tileset.tres', tres);

    const result = await parseTileSet(projectRoot, resourcePath);
    assert.strictEqual(result.sources.length, 2);
    const ids = result.sources.map((s) => s.sourceId).sort((a, b) => a - b);
    assert.deepStrictEqual(ids, [0, 5]);
    const bSource = result.sources.find((s) => s.sourceId === 5);
    assert.strictEqual(bSource?.columns, 2);
  });

  test('parses SVG textures using declared width/height attributes', async () => {
    fs.writeFileSync(
      path.join(projectRoot, 'assets', 'tiles', 'atlas.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="16"></svg>',
      'utf8'
    );
    const tres = `[gd_resource type="TileSet" load_steps=3 format=3]

[ext_resource type="Texture2D" path="res://assets/tiles/atlas.svg" id="1"]

[sub_resource type="TileSetAtlasSource" id="1"]
texture = ExtResource("1")
texture_region_size = Vector2i(16, 16)

[resource]
tile_size = Vector2i(16, 16)
sources/0 = SubResource("1")
`;
    const resourcePath = writeTres('tileset.tres', tres);

    const result = await parseTileSet(projectRoot, resourcePath);
    assert.strictEqual(result.sources[0].columns, 3);
    assert.strictEqual(result.sources[0].rows, 1);
    assert.ok(result.sources[0].dataUri.startsWith('data:image/svg+xml;base64,'));
  });

  test('throws when an SVG texture has no numeric width/height', async () => {
    fs.writeFileSync(
      path.join(projectRoot, 'assets', 'tiles', 'atlas.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      'utf8'
    );
    const tres = `[gd_resource type="TileSet" load_steps=3 format=3]

[ext_resource type="Texture2D" path="res://assets/tiles/atlas.svg" id="1"]

[sub_resource type="TileSetAtlasSource" id="1"]
texture = ExtResource("1")
texture_region_size = Vector2i(16, 16)

[resource]
tile_size = Vector2i(16, 16)
sources/0 = SubResource("1")
`;
    const resourcePath = writeTres('tileset.tres', tres);

    await assert.rejects(parseTileSet(projectRoot, resourcePath), /must declare numeric width and height/);
  });

  test('throws for an unsupported texture extension', async () => {
    fs.writeFileSync(path.join(projectRoot, 'assets', 'tiles', 'atlas.bmp'), 'not really a bmp', 'utf8');
    const tres = `[gd_resource type="TileSet" load_steps=3 format=3]

[ext_resource type="Texture2D" path="res://assets/tiles/atlas.bmp" id="1"]

[sub_resource type="TileSetAtlasSource" id="1"]
texture = ExtResource("1")
texture_region_size = Vector2i(16, 16)

[resource]
tile_size = Vector2i(16, 16)
sources/0 = SubResource("1")
`;
    const resourcePath = writeTres('tileset.tres', tres);

    await assert.rejects(parseTileSet(projectRoot, resourcePath), /Unsupported TileSet texture/);
  });

  test('throws when there are no readable atlas sources', async () => {
    const tres = `[gd_resource type="TileSet" load_steps=1 format=3]

[resource]
tile_size = Vector2i(16, 16)
`;
    const resourcePath = writeTres('empty.tres', tres);

    await assert.rejects(parseTileSet(projectRoot, resourcePath), /no readable atlas sources/);
  });

  test('skips a sources entry whose SubResource id is not defined', async () => {
    writePng(path.join(projectRoot, 'assets', 'tiles', 'atlas.png'), 16, 16);
    const tres = `[gd_resource type="TileSet" load_steps=3 format=3]

[ext_resource type="Texture2D" path="res://assets/tiles/atlas.png" id="1"]

[sub_resource type="TileSetAtlasSource" id="1"]
texture = ExtResource("1")
texture_region_size = Vector2i(16, 16)

[resource]
tile_size = Vector2i(16, 16)
sources/0 = SubResource("1")
sources/1 = SubResource("missing")
`;
    const resourcePath = writeTres('tileset.tres', tres);

    const result = await parseTileSet(projectRoot, resourcePath);
    assert.strictEqual(result.sources.length, 1);
    assert.strictEqual(result.sources[0].sourceId, 0);
  });
});
