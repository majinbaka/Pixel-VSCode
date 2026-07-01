import * as vscode from 'vscode';

export class PixelDocument implements vscode.CustomDocument {
  private readonly onDidChangeContentEmitter = new vscode.EventEmitter<vscode.WebviewPanel | undefined>();
  private disposed = false;
  private bytes: Uint8Array;

  public readonly onDidChangeContent = this.onDidChangeContentEmitter.event;

  public constructor(public readonly uri: vscode.Uri, initialBytes: Uint8Array) {
    this.bytes = initialBytes;
  }

  public get data(): Uint8Array {
    return this.bytes;
  }

  public update(bytes: Uint8Array, source?: vscode.WebviewPanel): void {
    if (this.disposed) {
      return;
    }

    this.bytes = bytes;
    this.onDidChangeContentEmitter.fire(source);
  }

  public dispose(): void {
    this.disposed = true;
    this.onDidChangeContentEmitter.dispose();
  }
}
