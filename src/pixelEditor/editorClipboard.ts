import { EditorClipboardPayload } from '../shared/types';

let clipboard: EditorClipboardPayload | undefined;

export function setEditorClipboard(payload: EditorClipboardPayload): void {
  clipboard = payload;
}

export function getEditorClipboard(): EditorClipboardPayload | undefined {
  return clipboard;
}
