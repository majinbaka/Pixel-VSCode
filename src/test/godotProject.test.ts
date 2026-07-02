import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  findGodotProjectRoot,
  toResourcePath,
  resourcePathToAbsolute,
  sanitizeResourceId,
  pascalCase
} from '../godotProject';

suite('godotProject', () => {
  suite('toResourcePath / resourcePathToAbsolute', () => {
    test('toResourcePath converts an absolute path under the project root to a res:// path', () => {
      const projectRoot = path.join(path.sep, 'project');
      const absolute = path.join(projectRoot, 'assets', 'maps', 'chunk.tscn');
      assert.strictEqual(toResourcePath(projectRoot, absolute), 'res://assets/maps/chunk.tscn');
    });

    test('resourcePathToAbsolute converts a res:// path back to an absolute path', () => {
      const projectRoot = path.join(path.sep, 'project');
      const absolute = resourcePathToAbsolute(projectRoot, 'res://assets/maps/chunk.tscn');
      assert.strictEqual(absolute, path.join(projectRoot, 'assets', 'maps', 'chunk.tscn'));
    });

    test('resourcePathToAbsolute throws for a path missing the res:// prefix', () => {
      assert.throws(
        () => resourcePathToAbsolute('/project', 'assets/maps/chunk.tscn'),
        /Expected a res:\/\/ path/
      );
    });

    test('round-trips through both directions', () => {
      const projectRoot = path.join(path.sep, 'project');
      const absolute = path.join(projectRoot, 'a', 'b', 'c.tres');
      const resourcePath = toResourcePath(projectRoot, absolute);
      assert.strictEqual(resourcePathToAbsolute(projectRoot, resourcePath), absolute);
    });
  });

  suite('sanitizeResourceId', () => {
    test('lowercases and passes through a valid identifier', () => {
      assert.strictEqual(sanitizeResourceId('Open_World'), 'open_world');
    });

    test('converts hyphens and whitespace to underscores', () => {
      assert.strictEqual(sanitizeResourceId('open-world chunk 0'), 'open_world_chunk_0');
    });

    test('trims surrounding whitespace', () => {
      assert.strictEqual(sanitizeResourceId('  chunk  '), 'chunk');
    });

    test('rejects an identifier starting with a digit', () => {
      assert.strictEqual(sanitizeResourceId('0chunk'), undefined);
    });

    test('rejects an empty string', () => {
      assert.strictEqual(sanitizeResourceId(''), undefined);
      assert.strictEqual(sanitizeResourceId('   '), undefined);
    });

    test('rejects characters outside [a-z0-9_] after normalization', () => {
      assert.strictEqual(sanitizeResourceId('chunk!'), undefined);
      assert.strictEqual(sanitizeResourceId('chunk/0'), undefined);
    });
  });

  suite('pascalCase', () => {
    test('converts snake_case to PascalCase', () => {
      assert.strictEqual(pascalCase('open_world_chunk'), 'OpenWorldChunk');
    });

    test('converts kebab-case and spaced words to PascalCase', () => {
      assert.strictEqual(pascalCase('open-world chunk'), 'OpenWorldChunk');
    });

    test('collapses multiple separators', () => {
      assert.strictEqual(pascalCase('open__world--chunk'), 'OpenWorldChunk');
    });

    test('handles an already-capitalized single word', () => {
      assert.strictEqual(pascalCase('Chunk'), 'Chunk');
    });

    test('returns an empty string for input with no alphanumeric characters', () => {
      assert.strictEqual(pascalCase('___'), '');
    });
  });

  suite('findGodotProjectRoot', () => {
    let tmpRoot: string;

    setup(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-vscode-godot-'));
    });

    teardown(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    test('finds project.godot in an ancestor directory of the given resource', () => {
      fs.writeFileSync(path.join(tmpRoot, 'project.godot'), '');
      const nested = path.join(tmpRoot, 'assets', 'maps');
      fs.mkdirSync(nested, { recursive: true });
      const resource = vscode.Uri.file(path.join(nested, 'chunk.tscn'));

      assert.strictEqual(findGodotProjectRoot(resource), fs.realpathSync(tmpRoot));
    });

    test('returns undefined when no project.godot exists in any ancestor', () => {
      const nested = path.join(tmpRoot, 'assets', 'maps');
      fs.mkdirSync(nested, { recursive: true });
      const resource = vscode.Uri.file(path.join(nested, 'chunk.tscn'));

      assert.strictEqual(findGodotProjectRoot(resource), undefined);
    });

    test('returns undefined for a non-file-scheme resource with no workspace folders', () => {
      const resource = vscode.Uri.parse('untitled:Untitled-1');
      assert.strictEqual(findGodotProjectRoot(resource), undefined);
    });
  });
});
