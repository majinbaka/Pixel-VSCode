# Pixel VSCode

VS Code extension scaffold for creating and editing pixel art PNG files.

## Features

- Create a blank pixel PNG from the command palette with `Pixel: New Pixel Image`.
- Open PNG files with a custom pixel editor.
- Draw, erase, fill, pick colors, resize the canvas, and save back to disk.
- Work with session layers and flatten the visible result into PNG on save.
- Pick colors from built-in palettes such as PICO-8, Game Boy, DawnBringer 16, and AAP-16.
- Preview PNG frame animations with `Pixel: Preview PNG Animation`, selecting multiple frames and setting one duration for all frames or per-frame durations.

## Development

```sh
npm install
npm run compile
npx @vscode/vsce package
```

Press `F5` in VS Code to launch an Extension Development Host.
