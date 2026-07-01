export function parseCanvasSize(value: string): { width: number; height: number } | undefined {
  const match = value.trim().match(/^(\d{1,4})\s*x\s*(\d{1,4})$/i);
  if (!match) {
    return undefined;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1024 || height > 1024) {
    return undefined;
  }

  return { width, height };
}

export function decodePngDataUri(dataUri: string): Uint8Array | undefined {
  const match = dataUri.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    return undefined;
  }

  return new Uint8Array(Buffer.from(match[1], 'base64'));
}
