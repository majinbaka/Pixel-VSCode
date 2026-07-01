import * as vscode from 'vscode';

export class MapDocument implements vscode.CustomDocument {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private disposed = false;
  private bytes: Uint8Array;

  public readonly onDidChangeContent = this.changeEmitter.event;

  public constructor(public readonly uri: vscode.Uri, bytes: Uint8Array) {
    this.bytes = bytes;
  }

  public get data(): Uint8Array {
    return this.bytes;
  }

  public update(bytes: Uint8Array, notify = true): void {
    if (this.disposed) {
      return;
    }
    this.bytes = bytes;
    if (notify) {
      this.changeEmitter.fire();
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.changeEmitter.dispose();
  }
}
