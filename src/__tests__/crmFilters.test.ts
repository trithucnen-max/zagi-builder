/**
 * @file crmFilters.test.ts
 * @description Unit tests to verify the correctness of all CRM contact filters and Vietnamese sorting using mocked DB queries.
 */

// Mock uuid library to avoid ESM parsing issue in Jest
jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid'
}));

// Mock Electron dependencies before any imports
jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return './test-userdata';
      return '.';
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (str: string) => Buffer.from(str),
    decryptString: (buf: Buffer) => buf.toString()
  }
}), { virtual: true });

// Mock Logger to keep test output clean
jest.mock('../utils/Logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}), { virtual: true });

// Mock WorkspaceManager and AppModeManager to prevent actual workspace lookups
const mockWorkspaceManager = {
  default: {
    getInstance: () => ({
      getActiveDbPath: () => null,
      getActiveModeType: () => 'standalone'
    })
  }
};

const mockAppModeManager = {
  default: {
    getInstance: () => ({
      isEmployeeMode: () => false,
      getMode: () => 'standalone'
    })
  }
};

jest.mock('../utils/WorkspaceManager', () => mockWorkspaceManager, { virtual: true });
jest.mock('../../utils/WorkspaceManager', () => mockWorkspaceManager, { virtual: true });
jest.mock('../utils/AppModeManager', () => mockAppModeManager, { virtual: true });
jest.mock('../../utils/AppModeManager', () => mockAppModeManager, { virtual: true });

import DatabaseService from '../services/database/DatabaseService';

describe('CRM Filters Comprehensive Tests (Pure JS Filtering)', () => {
  let dbService: DatabaseService;
  let realDate: any;
  const mockDate = new Date(2026, 6, 20, 12, 0, 0); // Monday, July 20, 2026

  let mockFriends: any[] = [];
  let mockContacts: any[] = [];
  let mockLocalLabels: any[] = [];
  let mockNotes: any[] = [];

  beforeAll(() => {
    // Override global Date to freeze time during test execution
    realDate = global.Date;
    global.Date = class extends realDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          return mockDate;
        }
        super(...args);
      }
    } as any;

    // Reset DatabaseService instance and mock db
    delete (DatabaseService as any).instance;
    
    // Bypass initialization checks
    Object.defineProperty(DatabaseService.prototype, 'initialized', { get: () => true, configurable: true });

    // Mock query execution to avoid loading native better-sqlite3 binary
    DatabaseService.prototype.query = jest.fn().mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('FROM friends f')) {
        return mockFriends;
      }
      if (sql.includes('FROM contacts WHERE')) {
        return mockContacts;
      }
      if (sql.includes('FROM local_label_threads')) {
        return mockLocalLabels;
      }
      if (sql.includes('FROM crm_notes')) {
        return mockNotes;
      }
      return [];
    });

    dbService = DatabaseService.getInstance();
  });

  afterAll(() => {
    // Restore global Date
    global.Date = realDate;
  });

  beforeEach(() => {
    mockFriends = [];
    mockContacts = [];
    mockLocalLabels = [];
    mockNotes = [];
  });

  describe('Gender Filter', () => {
    it('should correctly filter contacts by gender', () => {
      const ownerId = 'owner-1';
      mockContacts = [
        { contact_id: 'c1', display_name: 'Nam 1', gender: 0, is_friend: 0, contact_type: 'user' },
        { contact_id: 'c2', display_name: 'Nữ 1', gender: 1, is_friend: 0, contact_type: 'user' },
        { contact_id: 'c3', display_name: 'Chưa biết', gender: null, is_friend: 0, contact_type: 'user' }
      ];

      // Filter: male
      const resMale = dbService.getCRMContacts(ownerId, { gender: 'male' });
      expect(resMale.contacts.map(c => c.contact_id)).toEqual(['c1']);

      // Filter: female
      const resFemale = dbService.getCRMContacts(ownerId, { gender: 'female' });
      expect(resFemale.contacts.map(c => c.contact_id)).toEqual(['c2']);

      // Filter: unknown
      const resUnknown = dbService.getCRMContacts(ownerId, { gender: 'unknown' });
      expect(resUnknown.contacts.map(c => c.contact_id)).toEqual(['c3']);

      // Filter: all
      const resAll = dbService.getCRMContacts(ownerId, { gender: 'all' });
      expect(resAll.contacts.length).toBe(3);
    });
  });

  describe('Birthday Filter', () => {
    it('should correctly filter contacts by birthday today/this_week/this_month', () => {
      const ownerId = 'owner-1';
      // Today is Monday, July 20, 2026.
      // - Monday, July 20: 20/07/1990 (Today, This Week, This Month)
      // - Tuesday, July 21: 21/07 (This Week, This Month)
      // - Sunday, July 26: 26/07/1995 (This Week, This Month)
      // - Last Week (Monday, July 13): 13/07/1995 (This Month only)
      // - Next Week (Monday, July 27): 27/07/1995 (This Month only)
      // - Next Month (August 1): 01/08/1990 (August)
      // - No Birthday: NULL
      mockContacts = [
        { contact_id: 'b_today', display_name: 'B Today', birthday: '20/07/1990', is_friend: 0, contact_type: 'user' },
        { contact_id: 'b_tue', display_name: 'B Tue', birthday: '21/07', is_friend: 0, contact_type: 'user' },
        { contact_id: 'b_sun', display_name: 'B Sun', birthday: '26/07/1995', is_friend: 0, contact_type: 'user' },
        { contact_id: 'b_prev_week', display_name: 'B Prev Week', birthday: '13/07/1995', is_friend: 0, contact_type: 'user' },
        { contact_id: 'b_next_week', display_name: 'B Next Week', birthday: '27/07/1995', is_friend: 0, contact_type: 'user' },
        { contact_id: 'b_august', display_name: 'B August', birthday: '01/08/1990', is_friend: 0, contact_type: 'user' },
        { contact_id: 'b_none', display_name: 'B None', birthday: null, is_friend: 0, contact_type: 'user' }
      ];

      // Filter: today
      const resToday = dbService.getCRMContacts(ownerId, { birthdayFilter: 'today' });
      expect(resToday.contacts.map(c => c.contact_id)).toEqual(['b_today']);

      // Filter: this_week
      const resThisWeek = dbService.getCRMContacts(ownerId, { birthdayFilter: 'this_week' });
      const weekIds = resThisWeek.contacts.map(c => c.contact_id).sort();
      expect(weekIds).toEqual(['b_sun', 'b_today', 'b_tue']);

      // Filter: this_month
      const resThisMonth = dbService.getCRMContacts(ownerId, { birthdayFilter: 'this_month' });
      const monthIds = resThisMonth.contacts.map(c => c.contact_id).sort();
      expect(monthIds).toEqual(['b_next_week', 'b_prev_week', 'b_sun', 'b_today', 'b_tue']);

      // Filter: has_birthday
      const resHas = dbService.getCRMContacts(ownerId, { birthdayFilter: 'has_birthday' });
      expect(resHas.contacts.map(c => c.contact_id)).not.toContain('b_none');
      expect(resHas.contacts.length).toBe(6);

      // Filter: no_birthday
      const resNo = dbService.getCRMContacts(ownerId, { birthdayFilter: 'no_birthday' });
      expect(resNo.contacts.map(c => c.contact_id)).toEqual(['b_none']);
    });

    it('should support dots and dashes in birthday string delimiters safely', () => {
      const ownerId = 'owner-1';
      mockContacts = [
        { contact_id: 'dot_bday', display_name: 'Dot Birthday', birthday: '20.07.1990', is_friend: 0, contact_type: 'user' },
        { contact_id: 'dash_bday', display_name: 'Dash Birthday', birthday: '21-07', is_friend: 0, contact_type: 'user' }
      ];

      const resToday = dbService.getCRMContacts(ownerId, { birthdayFilter: 'today' });
      expect(resToday.contacts.map(c => c.contact_id)).toEqual(['dot_bday']);

      const resWeek = dbService.getCRMContacts(ownerId, { birthdayFilter: 'this_week' });
      const weekIds = resWeek.contacts.map(c => c.contact_id).sort();
      expect(weekIds).toEqual(['dash_bday', 'dot_bday']);
    });
  });

  describe('Salutation Filter', () => {
    it('should correctly filter contacts by salutation with proper default fallback', () => {
      const ownerId = 'owner-1';
      mockContacts = [
        { contact_id: 's1', display_name: 'Male Default', gender: 0, salutation: null, is_friend: 0, contact_type: 'user' },
        { contact_id: 's2', display_name: 'Female Default', gender: 1, salutation: null, is_friend: 0, contact_type: 'user' },
        { contact_id: 's3', display_name: 'Unknown Default', gender: null, salutation: null, is_friend: 0, contact_type: 'user' },
        { contact_id: 's4', display_name: 'Male Custom', gender: 0, salutation: 'Chú', is_friend: 0, contact_type: 'user' }
      ];

      // Filter: Anh (Fallback for male default)
      const resAnh = dbService.getCRMContacts(ownerId, { salutation: 'Anh' });
      expect(resAnh.contacts.map(c => c.contact_id)).toEqual(['s1']);

      // Filter: Chị (Fallback for female default)
      const resChi = dbService.getCRMContacts(ownerId, { salutation: 'Chị' });
      expect(resChi.contacts.map(c => c.contact_id)).toEqual(['s2']);

      // Filter: Anh/Chị (Fallback for unknown default)
      const resBan = dbService.getCRMContacts(ownerId, { salutation: 'Anh/Chị' });
      expect(resBan.contacts.map(c => c.contact_id)).toEqual(['s3']);

      // Filter: Chú (Custom value)
      const resChu = dbService.getCRMContacts(ownerId, { salutation: 'Chú' });
      expect(resChu.contacts.map(c => c.contact_id)).toEqual(['s4']);
    });
  });

  describe('Group ID Prefix Normalization Filter', () => {
    it('should correctly resolve Zalo labels, local labels, and notes regardless of "g" prefix', () => {
      const ownerId = 'owner-1';
      mockContacts = [
        { contact_id: 'g12345', display_name: 'Group 1', contact_type: 'group', is_friend: 0 },
        { contact_id: 'g67890', display_name: 'Group 2', contact_type: 'group', is_friend: 0 }
      ];

      // 1. Zalo labels filter: selectedZaloLabelContactIds has '12345' (stripped in frontend)
      const resZaloLabel = dbService.getCRMContacts(ownerId, { contactIds: ['12345'], contactType: 'group' });
      expect(resZaloLabel.contacts.map(c => c.contact_id)).toEqual(['g12345']);

      // 2. Local labels filter: group g12345 mapped to label ID 5
      mockLocalLabels = [
        { thread_id: 'g12345', label_id: 5 }
      ];
      const resLocalLabel = dbService.getCRMContacts(ownerId, { tagIds: [5], contactType: 'group' });
      expect(resLocalLabel.contacts.map(c => c.contact_id)).toEqual(['g12345']);

      // 3. Notes filter: g12345 has a note
      mockNotes = [
        { contact_id: 'g12345' }
      ];
      const resNotes = dbService.getCRMContacts(ownerId, { hasNotes: true, contactType: 'group' });
      expect(resNotes.contacts.map(c => c.contact_id)).toEqual(['g12345']);
    });
  });

  describe('Vietnamese Name Sorting', () => {
    it('should sort Vietnamese names alphabetically correct (localeCompare)', () => {
      const ownerId = 'owner-1';
      mockContacts = [
        { contact_id: 'v1', display_name: 'Đông', is_friend: 0, contact_type: 'user' },
        { contact_id: 'v2', display_name: 'Bình', is_friend: 0, contact_type: 'user' },
        { contact_id: 'v3', display_name: 'Cường', is_friend: 0, contact_type: 'user' },
        { contact_id: 'v4', display_name: 'Dũng', is_friend: 0, contact_type: 'user' },
        { contact_id: 'v5', display_name: 'An', is_friend: 0, contact_type: 'user' }
      ];

      const res = dbService.getCRMContacts(ownerId, { sortBy: 'name', sortDir: 'asc' });
      const names = res.contacts.map(c => c.display_name);
      expect(names).toEqual(['An', 'Bình', 'Cường', 'Dũng', 'Đông']);
    });
  });
});
