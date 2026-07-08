/**
 * @file EventBuffer.test.ts
 * @description Unit tests cho EventBuffer — v27.2.7
 */

import EventBuffer from '../services/socket/EventBuffer';

jest.mock('../utils/Logger', () => ({
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('EventBuffer unit tests', () => {
  let eventBuffer: EventBuffer;

  beforeEach(() => {
    eventBuffer = new EventBuffer();
  });

  afterEach(() => {
    eventBuffer.reset();
  });

  it('should push events and assign incrementing seqId starting from 1', () => {
    const id1 = eventBuffer.push('event:test', { data: 'test1' });
    const id2 = eventBuffer.push('event:test', { data: 'test2' });
    const id3 = eventBuffer.push('event:test', { data: 'test3' });

    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(id3).toBe(3);
    expect(eventBuffer.size).toBe(3);
  });

  it('should return all events when lastSeqId is 0 or less', () => {
    eventBuffer.push('event:test', { data: 'test1' });
    eventBuffer.push('event:test', { data: 'test2' });

    const allEvents = eventBuffer.getSince(0);
    expect(allEvents.length).toBe(2);
    expect(allEvents[0].seqId).toBe(1);
    expect(allEvents[1].seqId).toBe(2);

    const negativeEvents = eventBuffer.getSince(-5);
    expect(negativeEvents.length).toBe(2);
  });

  it('should return only events with seqId greater than lastSeqId', () => {
    eventBuffer.push('event:test', { data: 'test1' }); // seqId 1
    eventBuffer.push('event:test', { data: 'test2' }); // seqId 2
    eventBuffer.push('event:test', { data: 'test3' }); // seqId 3

    const missed = eventBuffer.getSince(1);
    expect(missed.length).toBe(2);
    expect(missed[0].seqId).toBe(2);
    expect(missed[1].seqId).toBe(3);

    const upToDate = eventBuffer.getSince(3);
    expect(upToDate.length).toBe(0);
  });

  it('should enforce MAX_SIZE and prune oldest events when buffer is full', () => {
    // Config limit to 100 for testability
    EventBuffer.setMaxSize(100);

    for (let i = 0; i < 120; i++) {
      eventBuffer.push('event:bulk', { index: i });
    }

    expect(eventBuffer.size).toBe(100);
    expect(eventBuffer.totalPruned).toBe(20);

    // Oldest 20 should be pruned (seqIds 1 to 20 should be missing)
    const activeEvents = eventBuffer.getSince(0);
    expect(activeEvents[0].seqId).toBe(21);
    expect(activeEvents[activeEvents.length - 1].seqId).toBe(120);
  });

  it('should reset properly', () => {
    eventBuffer.push('event:test', { data: 'test' });
    expect(eventBuffer.size).toBe(1);

    eventBuffer.reset();
    expect(eventBuffer.size).toBe(0);
    expect(eventBuffer.totalPruned).toBe(0);
    
    const newId = eventBuffer.push('event:test', { data: 'new' });
    expect(newId).toBe(1);
  });
});
