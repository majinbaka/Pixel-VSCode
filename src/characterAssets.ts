import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PNG } from 'pngjs';
import { findGodotProjectRoot, sanitizeResourceId } from './godotProject';

type EntityType = 'character' | 'monster';

type ActionLayout = {
  action: string;
  columns: number;
  rows: number;
};

const CHARACTER_ACTION_LAYOUTS: ActionLayout[] = [
  { action: 'backslash', columns: 13, rows: 4 },
  { action: 'climb', columns: 6, rows: 1 },
  { action: 'combat_idle', columns: 2, rows: 4 },
  { action: 'emote', columns: 3, rows: 4 },
  { action: 'halfslash', columns: 6, rows: 4 },
  { action: 'hurt', columns: 6, rows: 1 },
  { action: 'idle', columns: 2, rows: 4 },
  { action: 'jump', columns: 5, rows: 4 },
  { action: 'run', columns: 8, rows: 4 },
  { action: 'shoot', columns: 13, rows: 4 },
  { action: 'sit', columns: 3, rows: 4 },
  { action: 'slash', columns: 6, rows: 4 },
  { action: 'spellcast', columns: 7, rows: 4 },
  { action: 'thrust', columns: 8, rows: 4 },
  { action: 'walk', columns: 9, rows: 4 }
];

const FRAME_SIZE = 64;
const MONSTER_ACTION_LAYOUTS: ActionLayout[] = CHARACTER_ACTION_LAYOUTS.map(({ action }) => ({
  action,
  columns: 2,
  rows: 4
}));

export async function createPixelMonsterCharacter(): Promise<void> {
  const projectRoot = findGodotProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage('Open a Godot project folder before creating a Pixel Monster character.');
    return;
  }

  const entityType = await vscode.window.showQuickPick(['character', 'monster'], {
    title: 'Pixel Monster Asset Type',
    placeHolder: 'Choose where the generated action pack will be used.'
  }) as EntityType | undefined;
  if (!entityType) {
    return;
  }

  const idInput = await vscode.window.showInputBox({
    title: `New Pixel Monster ${entityType}`,
    prompt: 'Lowercase id used by the Godot runtime.',
    value: entityType === 'character' ? 'character_03' : 'monster_21',
    validateInput(value) {
      return sanitizeResourceId(value) ? undefined : 'Use lowercase letters, numbers, and underscores; start with a letter.';
    }
  });
  const entityId = idInput ? sanitizeResourceId(idInput) : undefined;
  if (!entityId) {
    return;
  }

  const roots = getEntityRoots(projectRoot, entityType);
  const outputDir = path.join(roots.fullRoot, entityId);
  if (fs.existsSync(outputDir)) {
    vscode.window.showErrorMessage(`Character pack already exists: ${outputDir}`);
    return;
  }

  const templateOptions = await listTemplateOptions(roots.fullRoot);
  const template = await vscode.window.showQuickPick(templateOptions, {
    title: 'Character Pack Template',
    placeHolder: 'Blank creates transparent LPC sheets; copy starts from an existing pack.'
  });
  if (!template) {
    return;
  }

  await fs.promises.mkdir(outputDir, { recursive: true });
  const layouts = layoutsFor(entityType);
  if (template.id === 'blank') {
    await createBlankActionSheets(outputDir, layouts);
  } else {
    await copyActionSheets(path.join(roots.fullRoot, template.id), outputDir, layouts);
  }

  await fs.promises.mkdir(roots.previewRoot, { recursive: true });
  await fs.promises.copyFile(
    path.join(outputDir, 'idle.png'),
    path.join(roots.previewRoot, `${entityId}.png`)
  );

  const idleUri = vscode.Uri.file(path.join(outputDir, 'idle.png'));
  await vscode.commands.executeCommand('vscode.openWith', idleUri, 'pixelVscode.pixelEditor');
  vscode.window.showInformationMessage(
    `Created ${entityId} with ${layouts.length} LPC action sheets. Edit each PNG, then run Validate and Sync Character Pack.`
  );
}

export async function syncPixelMonsterCharacter(resource?: vscode.Uri): Promise<void> {
  const target = resource ?? vscode.window.activeTextEditor?.document.uri;
  const pack = target ? resolveCharacterPack(target.fsPath) : undefined;
  if (!pack) {
    vscode.window.showWarningMessage('Open a PNG inside assets/generated/lpc_characters_full or lpc_monsters_full.');
    return;
  }

  const layouts = layoutsFor(pack.entityType);
  const errors = await validateActionPack(pack.fullDir, layouts);
  if (errors.length > 0) {
    vscode.window.showErrorMessage(`Character pack is not game-ready: ${errors.slice(0, 4).join('; ')}`);
    return;
  }

  await fs.promises.mkdir(pack.previewRoot, { recursive: true });
  await fs.promises.copyFile(
    path.join(pack.fullDir, 'idle.png'),
    path.join(pack.previewRoot, `${pack.entityId}.png`)
  );

  vscode.window.showInformationMessage(
    `${pack.entityId} is valid: ${layouts.length} actions, 64x64 frames, idle preview synchronized.`
  );
}

function getEntityRoots(projectRoot: string, entityType: EntityType) {
  const plural = entityType === 'character' ? 'characters' : 'monsters';
  const generatedRoot = path.join(projectRoot, 'assets', 'generated');
  return {
    fullRoot: path.join(generatedRoot, `lpc_${plural}_full`),
    previewRoot: path.join(generatedRoot, `lpc_${plural}`)
  };
}

async function listTemplateOptions(fullRoot: string): Promise<Array<{ label: string; description: string; id: string }>> {
  const options = [{
    label: 'Blank LPC action pack',
    description: 'Create transparent sheets with the exact Pixel Monster frame layout.',
    id: 'blank'
  }];

  if (!fs.existsSync(fullRoot)) {
    return options;
  }

  const entries = await fs.promises.readdir(fullRoot, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    options.push({
      label: `Copy ${entry.name}`,
      description: 'Clone all action sheets as an editable starting point.',
      id: entry.name
    });
  }
  return options;
}

async function createBlankActionSheets(outputDir: string, layouts: ActionLayout[]): Promise<void> {
  for (const layout of layouts) {
    const image = new PNG({
      width: layout.columns * FRAME_SIZE,
      height: layout.rows * FRAME_SIZE
    });
    await fs.promises.writeFile(path.join(outputDir, `${layout.action}.png`), PNG.sync.write(image));
  }
}

async function copyActionSheets(sourceDir: string, outputDir: string, layouts: ActionLayout[]): Promise<void> {
  const errors = await validateActionPack(sourceDir, layouts);
  if (errors.length > 0) {
    throw new Error(`Template pack is invalid: ${errors.join('; ')}`);
  }
  for (const layout of layouts) {
    await fs.promises.copyFile(
      path.join(sourceDir, `${layout.action}.png`),
      path.join(outputDir, `${layout.action}.png`)
    );
  }
}

async function validateActionPack(fullDir: string, layouts: ActionLayout[]): Promise<string[]> {
  const errors: string[] = [];
  for (const layout of layouts) {
    const actionPath = path.join(fullDir, `${layout.action}.png`);
    if (!fs.existsSync(actionPath)) {
      errors.push(`missing ${layout.action}.png`);
      continue;
    }

    try {
      const image = PNG.sync.read(await fs.promises.readFile(actionPath));
      const expectedWidth = layout.columns * FRAME_SIZE;
      const expectedHeight = layout.rows * FRAME_SIZE;
      if (image.width !== expectedWidth || image.height !== expectedHeight) {
        errors.push(`${layout.action}.png is ${image.width}x${image.height}, expected ${expectedWidth}x${expectedHeight}`);
      }
    } catch {
      errors.push(`${layout.action}.png is not a readable PNG`);
    }
  }
  return errors;
}

function resolveCharacterPack(filePath: string): {
  entityType: EntityType;
  entityId: string;
  fullDir: string;
  previewRoot: string;
} | undefined {
  const normalized = filePath.replaceAll('\\', '/');
  const match = normalized.match(/^(.*\/assets\/generated)\/lpc_(characters|monsters)_full\/([^/]+)\/[^/]+\.png$/);
  if (!match) {
    return undefined;
  }
  return {
    entityType: match[2] === 'characters' ? 'character' : 'monster',
    entityId: match[3],
    fullDir: path.dirname(filePath),
    previewRoot: path.join(match[1], `lpc_${match[2]}`)
  };
}

function layoutsFor(entityType: EntityType): ActionLayout[] {
  return entityType === 'character' ? CHARACTER_ACTION_LAYOUTS : MONSTER_ACTION_LAYOUTS;
}
