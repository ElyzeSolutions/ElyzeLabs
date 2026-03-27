import { describe, expect, it } from 'vitest';

import { detectOperatorInterventionBlocker } from '../../src/server.js';

describe('operator intervention blocker detection', () => {
  it('detects ssh passphrase prompts', () => {
    const detected = detectOperatorInterventionBlocker(
      "Enter passphrase for key '/home/user/.ssh/id_ed25519':"
    );
    expect(detected?.code).toBe('git_ssh_passphrase_prompt');
    expect(detected?.waitingPrompt).toContain('resume');
  });

  it('detects git auth failures that require operator action', () => {
    const detected = detectOperatorInterventionBlocker('fatal: Permission denied (publickey).');
    expect(detected?.code).toBe('git_ssh_publickey_denied');
  });

  it('ignores normal runtime output', () => {
    const detected = detectOperatorInterventionBlocker('build completed successfully');
    expect(detected).toBeNull();
  });
});
