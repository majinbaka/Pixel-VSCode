import * as assert from 'assert';
import { getEditorClipboard, setEditorClipboard } from '../pixelEditor/editorClipboard';

suite('editorClipboard', () => {
  test('setEditorClipboard then getEditorClipboard round-trips a layer payload', () => {
    setEditorClipboard({ kind: 'layer', name: 'Base', dataUri: 'data:image/png;base64,AAAA' });
    assert.deepStrictEqual(getEditorClipboard(), { kind: 'layer', name: 'Base', dataUri: 'data:image/png;base64,AAAA' });
  });

  test('setEditorClipboard then getEditorClipboard round-trips a selection payload', () => {
    setEditorClipboard({ kind: 'selection', width: 4, height: 8, dataUri: 'data:image/png;base64,BBBB' });
    assert.deepStrictEqual(getEditorClipboard(), { kind: 'selection', width: 4, height: 8, dataUri: 'data:image/png;base64,BBBB' });
  });

  test('setEditorClipboard overwrites a previous payload', () => {
    setEditorClipboard({ kind: 'layer', name: 'First', dataUri: 'data:image/png;base64,AAAA' });
    setEditorClipboard({ kind: 'layer', name: 'Second', dataUri: 'data:image/png;base64,CCCC' });
    assert.deepStrictEqual(getEditorClipboard(), { kind: 'layer', name: 'Second', dataUri: 'data:image/png;base64,CCCC' });
  });
});
