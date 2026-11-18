/** Tests of the role model and the session helpers. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readOnlyLabel, roleAbilities } from '../src/roles.ts';
import { artifactPath, projectPath, sessionSlot } from '../src/session.ts';

describe('roleAbilities', () => {
  it('gives each role what the host accepts from it', () => {
    assert.deepEqual(roleAbilities('owner'), { canEdit: true, canComment: true, canRemoveComments: true, canRestore: true, canAsk: true, canSaveToHost: true, canUseConnectors: true });
    assert.deepEqual(roleAbilities('editor'), { canEdit: true, canComment: true, canRemoveComments: true, canRestore: true, canAsk: false, canSaveToHost: false, canUseConnectors: false });
    assert.deepEqual(roleAbilities('commenter'), { canEdit: false, canComment: true, canRemoveComments: false, canRestore: false, canAsk: false, canSaveToHost: false, canUseConnectors: false });
    assert.deepEqual(roleAbilities('viewer'), { canEdit: false, canComment: false, canRemoveComments: false, canRestore: false, canAsk: false, canSaveToHost: false, canUseConnectors: false });
    assert.equal(roleAbilities('someone-new').canComment, false);
  });

  it('labels read-only roles', () => {
    assert.equal(readOnlyLabel('owner'), null);
    assert.equal(readOnlyLabel('editor'), null);
    assert.equal(readOnlyLabel('commenter'), 'Comment only');
    assert.equal(readOnlyLabel('viewer'), 'View only');
  });
});

describe('session helpers', () => {
  it('holds the session once it started', () => {
    const slot = sessionSlot<{ id: number }>();
    assert.equal(slot.maybeSession(), null);
    assert.throws(() => slot.session(), /not started/);
    const started = slot.set({ id: 1 });
    assert.equal(slot.session(), started);
    assert.equal(slot.maybeSession(), started);
  });

  it('maps project paths to artifact paths and back', () => {
    assert.equal(artifactPath('a/b.json'), 'project/a/b.json');
    assert.equal(projectPath('project/a/b.json'), 'a/b.json');
    assert.equal(projectPath('comments.json'), null);
  });
});
