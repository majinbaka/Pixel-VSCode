import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export function findGodotProjectRoot(resource?: vscode.Uri): string | undefined {
  const candidates: string[] = [];
  if (resource?.scheme === 'file') {
    candidates.push(path.dirname(resource.fsPath));
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme === 'file') {
      candidates.push(folder.uri.fsPath);
    }
  }

  for (const candidate of candidates) {
    let current = path.resolve(candidate);
    while (true) {
      if (fs.existsSync(path.join(current, 'project.godot'))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return undefined;
}

export function toResourcePath(projectRoot: string, absolutePath: string): string {
  const relative = path.relative(projectRoot, absolutePath).replaceAll(path.sep, '/');
  return `res://${relative}`;
}

export function resourcePathToAbsolute(projectRoot: string, resourcePath: string): string {
  if (!resourcePath.startsWith('res://')) {
    throw new Error(`Expected a res:// path, received '${resourcePath}'.`);
  }
  return path.join(projectRoot, resourcePath.slice('res://'.length));
}

export function sanitizeResourceId(value: string): string | undefined {
  const normalized = value.trim().toLowerCase().replaceAll('-', '_').replace(/\s+/g, '_');
  return /^[a-z][a-z0-9_]*$/.test(normalized) ? normalized : undefined;
}

export function pascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export async function runGodotMapExporter(
  context: vscode.ExtensionContext,
  projectRoot: string,
  inputPath: string,
  outputResourcePath: string
): Promise<void> {
  await runGodotExporter(context, projectRoot, 'godot_map_exporter.gd', inputPath, outputResourcePath, 'map');
}

async function runGodotExporter(
  context: vscode.ExtensionContext,
  projectRoot: string,
  exporterFileName: string,
  inputPath: string,
  outputResourcePath: string,
  label: string
): Promise<void> {
  const executable = vscode.workspace.getConfiguration('pixelVscode').get<string>('godotExecutable', 'godot');
  const exporterPath = path.join(context.extensionPath, 'media', exporterFileName);
  const outputAbsolutePath = resourcePathToAbsolute(projectRoot, outputResourcePath);
  await fs.promises.mkdir(path.dirname(outputAbsolutePath), { recursive: true });

  try {
    const result = await execFileAsync(executable, [
      '--headless',
      '--path',
      projectRoot,
      '--script',
      exporterPath,
      '--',
      '--input',
      inputPath,
      '--output',
      outputResourcePath
    ], {
      cwd: projectRoot,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024
    });

    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (output.includes('[ERROR]')) {
      throw new Error(output);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Godot ${label} export failed: ${message}`);
  }
}
