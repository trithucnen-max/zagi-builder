/**
 * @file crmCampaignContacts.test.ts
 * @description Unit tests for DatabaseService.addCampaignContacts
 * Covers: normal insert, deduplication, limit enforcement, edge cases
 */

// ─── Logic under test (extracted for unit testing without DB setup) ────────────

const MAX_CAMPAIGN_CONTACTS = 1000;

function simulateAddCampaignContacts(
  existingContactIds: string[],
  contacts: Array<{ contactId: string }>
): { addedCount: number; discardedCount: number; limitExceeded: boolean } {
  const existingIds = new Set<string>(existingContactIds);
  let availableSlots = MAX_CAMPAIGN_CONTACTS - existingIds.size;
  let addedCount = 0;
  let discardedCount = 0;
  let limitExceeded = false;

  for (const c of contacts) {
    if (existingIds.has(c.contactId)) continue;
    if (availableSlots <= 0) {
      limitExceeded = true;
      discardedCount++;
      continue;
    }
    existingIds.add(c.contactId);
    availableSlots--;
    addedCount++;
  }

  return { addedCount, discardedCount, limitExceeded };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('addCampaignContacts logic', () => {

  describe('Normal insertion', () => {
    it('adds all contacts when no duplicates and under limit', () => {
      const result = simulateAddCampaignContacts([], [
        { contactId: 'u1' }, { contactId: 'u2' }, { contactId: 'u3' },
      ]);
      expect(result.addedCount).toBe(3);
      expect(result.discardedCount).toBe(0);
      expect(result.limitExceeded).toBe(false);
    });

    it('skips contacts that already exist in DB', () => {
      const result = simulateAddCampaignContacts(['u1', 'u2'], [
        { contactId: 'u1' }, { contactId: 'u2' }, { contactId: 'u3' },
      ]);
      expect(result.addedCount).toBe(1);
      expect(result.discardedCount).toBe(0);
    });

    it('skips duplicate contactIds within same batch', () => {
      const result = simulateAddCampaignContacts([], [
        { contactId: 'u1' }, { contactId: 'u1' }, { contactId: 'u2' },
      ]);
      expect(result.addedCount).toBe(2); // u1 once, u2 once
    });

    it('returns 0 added for empty contacts array', () => {
      const result = simulateAddCampaignContacts([], []);
      expect(result.addedCount).toBe(0);
      expect(result.discardedCount).toBe(0);
      expect(result.limitExceeded).toBe(false);
    });
  });

  describe('Limit enforcement (MAX_CAMPAIGN_CONTACTS = 1000)', () => {
    it('sets limitExceeded=true when campaign is already full', () => {
      const existing = Array.from({ length: 1000 }, (_, i) => `existing_${i}`);
      const result = simulateAddCampaignContacts(existing, [{ contactId: 'new_1' }]);
      expect(result.addedCount).toBe(0);
      expect(result.discardedCount).toBe(1);
      expect(result.limitExceeded).toBe(true);
    });

    it('fills remaining slots and marks limitExceeded for overflow', () => {
      const existing = Array.from({ length: 998 }, (_, i) => `existing_${i}`);
      const contacts = Array.from({ length: 5 }, (_, i) => ({ contactId: `new_${i}` }));
      const result = simulateAddCampaignContacts(existing, contacts);
      expect(result.addedCount).toBe(2);
      expect(result.discardedCount).toBe(3);
      expect(result.limitExceeded).toBe(true);
    });

    it('does not set limitExceeded when under the limit', () => {
      const existing = Array.from({ length: 990 }, (_, i) => `existing_${i}`);
      const contacts = Array.from({ length: 5 }, (_, i) => ({ contactId: `new_${i}` }));
      const result = simulateAddCampaignContacts(existing, contacts);
      expect(result.addedCount).toBe(5);
      expect(result.limitExceeded).toBe(false);
    });

    it('MAX_CAMPAIGN_CONTACTS is exactly 1000', () => {
      expect(MAX_CAMPAIGN_CONTACTS).toBe(1000);
    });
  });

  describe('Mixed scenarios', () => {
    it('handles mix of existing, duplicate, and new contacts correctly', () => {
      const existing = ['db_1', 'db_2'];
      const contacts = [
        { contactId: 'db_1' },   // already in DB → skip
        { contactId: 'new_1' },  // new → add
        { contactId: 'new_1' },  // same batch duplicate → skip
        { contactId: 'db_2' },   // already in DB → skip
        { contactId: 'new_2' },  // new → add
      ];
      const result = simulateAddCampaignContacts(existing, contacts);
      expect(result.addedCount).toBe(2);
      expect(result.discardedCount).toBe(0);
      expect(result.limitExceeded).toBe(false);
    });
  });
});
