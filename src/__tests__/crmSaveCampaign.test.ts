/**
 * @file crmSaveCampaign.test.ts
 * @description Unit tests for CRM Campaign creation and soft-delete recovery logic
 */

interface MockCampaign {
  id?: number;
  owner_zalo_id: string;
  name: string;
  campaign_type: string;
  is_deleted?: number;
  created_at?: number;
}

class SimulatedCampaignDB {
  private campaigns: Map<number, MockCampaign> = new Map();
  private nextId = 1;

  public saveCRMCampaign(campaign: MockCampaign): number {
    const now = Date.now();
    const ownerZaloId = campaign.owner_zalo_id;
    const type = campaign.campaign_type || 'message';

    if (campaign.id && this.campaigns.has(campaign.id)) {
      const existing = this.campaigns.get(campaign.id)!;
      if (existing.owner_zalo_id === ownerZaloId) {
        const updated: MockCampaign = {
          ...existing,
          ...campaign,
          is_deleted: 0, // Un-delete if previously soft-deleted
        };
        this.campaigns.set(campaign.id, updated);
        return campaign.id;
      }
    }

    // Duplicate check within 1.5 seconds (ignoring soft-deleted records)
    for (const [, c] of this.campaigns) {
      if (
        c.owner_zalo_id === ownerZaloId &&
        c.name === campaign.name &&
        c.campaign_type === type &&
        (!c.is_deleted || c.is_deleted === 0) &&
        c.created_at &&
        now - c.created_at < 1500
      ) {
        return c.id!;
      }
    }

    const id = campaign.id || this.nextId++;
    const newCamp: MockCampaign = {
      ...campaign,
      id,
      is_deleted: 0,
      created_at: now,
    };
    this.campaigns.set(id, newCamp);
    return id;
  }

  public deleteCRMCampaign(id: number): void {
    const c = this.campaigns.get(id);
    if (c) {
      c.is_deleted = 1;
    }
  }

  public getCRMCampaigns(ownerZaloId: string): MockCampaign[] {
    const list: MockCampaign[] = [];
    for (const [, c] of this.campaigns) {
      if (c.owner_zalo_id === ownerZaloId && (!c.is_deleted || c.is_deleted === 0)) {
        list.push(c);
      }
    }
    return list;
  }
}

describe('saveCRMCampaign & soft-delete restoration logic', () => {
  let db: SimulatedCampaignDB;

  beforeEach(() => {
    db = new SimulatedCampaignDB();
  });

  it('creates new campaign and returns valid ID', () => {
    const id = db.saveCRMCampaign({ owner_zalo_id: 'zalo_1', name: 'Chiến dịch A', campaign_type: 'message' });
    expect(id).toBeGreaterThan(0);
    const list = db.getCRMCampaigns('zalo_1');
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Chiến dịch A');
  });

  it('un-deletes previously soft-deleted campaign when re-saved with id', () => {
    const id = db.saveCRMCampaign({ owner_zalo_id: 'zalo_1', name: 'Chiến dịch B', campaign_type: 'message' });
    expect(db.getCRMCampaigns('zalo_1').length).toBe(1);

    // Soft delete
    db.deleteCRMCampaign(id);
    expect(db.getCRMCampaigns('zalo_1').length).toBe(0);

    // Re-save/update with same id
    db.saveCRMCampaign({ id, owner_zalo_id: 'zalo_1', name: 'Chiến dịch B (Cập nhật)', campaign_type: 'message' });
    const list = db.getCRMCampaigns('zalo_1');
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Chiến dịch B (Cập nhật)');
    expect(list[0].is_deleted).toBe(0);
  });

  it('does not match soft-deleted campaigns in rapid duplicate check', () => {
    const id1 = db.saveCRMCampaign({ owner_zalo_id: 'zalo_1', name: 'Chiến dịch C', campaign_type: 'message' });
    db.deleteCRMCampaign(id1);

    // Re-create within 1.5s window
    const id2 = db.saveCRMCampaign({ owner_zalo_id: 'zalo_1', name: 'Chiến dịch C', campaign_type: 'message' });
    expect(id2).not.toBe(id1);
    expect(db.getCRMCampaigns('zalo_1').length).toBe(1);
  });
});
