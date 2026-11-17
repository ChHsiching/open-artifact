/**
 * The `/open-artifact` skill (skill.ts) and the `host.open` requests between the server and browser halves (host-open.ts).
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HostOpens } from '../src/server/host-open.ts';
import { creatableTypes, skillBody, skillProvider, SKILL_NAME, typesSection } from '../src/server/skill.ts';
import type { HostOpenRequest } from '../src/shared/routes.ts';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('skill', () => {
  it('lists only types a new artifact can be made of', () => {
    const types = creatableTypes([
      { id: 'design', title: 'Design', description: 'Boards. More.' },
      { id: 'off', title: 'Off', enabled: false },
      { id: 'broken', title: 'Broken', problems: ['x'] as never },
      { id: 'slides', title: '' },
    ]);
    assert.deepEqual(types, [
      { id: 'design', title: 'Design', description: 'Boards. More.' },
      { id: 'slides', title: 'slides' },
    ]);
    assert.equal(typesSection(types), '## Installed types\n\n- `design`: Design. Boards.\n- `slides`: slides');
    assert.match(typesSection(null), /quickstart/);
    assert.match(typesSection([]), /None is installed/);
  });

  it('strips the front matter', () => {
    assert.equal(skillBody('---\nname: x\n---\n\n# Body\n'), '# Body');
    assert.equal(skillBody('# Body'), '# Body');
  });

  it('is a user-invocable skill whose text ends with the installed types', async () => {
    const provider = skillProvider({ packageRoot, types: async () => [{ id: 'slides', title: 'Slides' }] });
    const [candidate] = await provider.list();
    assert.equal(candidate!.name, SKILL_NAME);
    assert.deepEqual(candidate!.invocation, { modelInvocable: false, userInvocable: true });
    const skill = await provider.get(candidate!);
    assert.ok(!('rank' in skill));
    assert.doesNotMatch(skill.content, /^---/);
    assert.match(skill.content, /type_url/);
    assert.match(skill.content, /- `slides`: Slides\n$/);
  });

  it('says how to find the types when the daemon cannot list them', async () => {
    const provider = skillProvider({
      packageRoot,
      types: async () => {
        throw new Error('down');
      },
    });
    const [candidate] = await provider.list();
    assert.match((await provider.get(candidate!)).content, /could not be read/);
  });
});

describe('HostOpens', () => {
  it('is false at once with nobody listening, or no session', async () => {
    const opens = new HostOpens(50);
    assert.equal(await opens.open('s1', 'http://x/'), false);
    opens.listen(() => {});
    assert.equal(await opens.open(null, 'http://x/'), false);
  });

  it('is true once one listener showed it', async () => {
    const opens = new HostOpens(1_000);
    const seen: HostOpenRequest[] = [];
    opens.listen((request) => {
      seen.push(request);
      opens.answer(request.id, false);
    });
    opens.listen((request) => setTimeout(() => opens.answer(request.id, true), 5));
    assert.equal(await opens.open('s1', 'http://x/', 'Deck'), true);
    assert.equal(seen[0]!.session, 's1');
    assert.equal(seen[0]!.title, 'Deck');
  });

  it('is false when every listener said no, or none answered in time', async () => {
    const opens = new HostOpens(30);
    const stop = opens.listen((request) => opens.answer(request.id, false));
    assert.equal(await opens.open('s1', 'http://x/'), false);
    stop();
    opens.listen(() => {});
    const started = Date.now();
    assert.equal(await opens.open('s1', 'http://x/'), false);
    assert.ok(Date.now() - started >= 25);
  });
});
