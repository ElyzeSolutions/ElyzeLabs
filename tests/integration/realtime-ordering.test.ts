import { describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

describe('realtime ordering', () => {
  it('sequence ids increase strictly for replay-safe delivery', () => {
    const db = new ControlPlaneDatabase(':memory:');
    db.migrate();

    const first = db.appendRealtimeEvent({
      kind: 'system.info',
      lane: 'default',
      level: 'info',
      message: 'one',
      data: {}
    });

    const second = db.appendRealtimeEvent({
      kind: 'system.info',
      lane: 'default',
      level: 'info',
      message: 'two',
      data: {}
    });

    expect(second.sequence).toBeGreaterThan(first.sequence);

    db.close();
  });
});
