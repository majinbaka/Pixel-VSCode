import * as vscode from 'vscode';
import { LayerStateFile } from '../layerState';

export class PixelDocument implements vscode.CustomDocument {
  private readonly onDidChangeContentEmitter = new vscode.EventEmitter<vscode.WebviewPanel | undefined>();
  private disposed = false;
  private bytes: Uint8Array;
  private layerState: LayerStateFile | undefined;

  public readonly onDidChangeContent = this.onDidChangeContentEmitter.event;

  public constructor(public readonly uri: vscode.Uri, initialBytes: Uint8Array, initialLayerState?: LayerStateFile) {
    this.bytes = initialBytes;
    this.layerState = initialLayerState;
  }

  public get data(): Uint8Array {
    return this.bytes;
  }

  public get currentLayerState(): LayerStateFile | undefined {
    return this.layerState;
  }

  public update(bytes: Uint8Array, layerState?: LayerStateFile, source?: vscode.WebviewPanel): void {
    if (this.disposed) {
      return;
    }

    this.bytes = bytes;
    this.layerState = layerState;
    this.onDidChangeContentEmitter.fire(source);
  }

  public dispose(): void {
    this.disposed = true;
    this.onDidChangeContentEmitter.dispose();
  }
}
