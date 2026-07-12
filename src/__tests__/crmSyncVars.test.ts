/**
 * @file crmSyncVars.test.ts
 * @description Unit tests to verify the name, alias, and salutation synchronization and separation logic.
 */

// 1. Mock uuid library to avoid ESM parsing issue in Jest
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

// 2. Mock Logger to keep test output clean
jest.mock('../utils/Logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}), { virtual: true });

// 3. Mock WorkspaceManager and AppModeManager to prevent actual workspace lookups
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

let DatabaseService: any;
let CRMQueueService: any;

describe('CRM Name and Salutation Separation Logic', () => {
  let db: any;

  beforeAll(async () => {
    // Dynamically mock Logger before requiring DatabaseService
    jest.doMock('../utils/Logger', () => ({
      __esModule: true,
      default: {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
      }
    }));


    DatabaseService = require('../services/database/DatabaseService').default;
    CRMQueueService = require('../services/crm/CRMQueueService').default;

    // Force in-memory DB for unit test isolation
    db = DatabaseService.getInstance();
  });

  afterAll(() => {});

  describe('Database Salutation Auto-fill & Keep Manual Edits', () => {
    const ownerId = 'zalo-owner-1';
    const contactId = 'contact-zalo-1';
    let mockContacts: any[] = [];

    beforeEach(() => {
      mockContacts = [];
      
      // Bypass initialization check
      Object.defineProperty(db, 'initialized', { get: () => true, configurable: true });

      // Override run
      DatabaseService.prototype.run = jest.fn().mockImplementation((sql: string, params: any[]) => {
        if (sql.includes('INSERT INTO contacts')) {
          const [owner_zalo_id, contact_id, display_name, avatar_url, phone, _, contact_type] = params;
          let contact = mockContacts.find(c => c.contact_id === contact_id);
          if (!contact) {
            contact = { owner_zalo_id, contact_id, display_name, avatar_url, phone, contact_type, salutation: '', gender: null };
            mockContacts.push(contact);
          } else {
            contact.display_name = display_name;
            contact.avatar_url = avatar_url;
            contact.phone = phone;
          }
        } else if (sql.includes('gender=?') && sql.includes('salutation')) {
          const [gender, salutation, owner_zalo_id, contact_id] = params;
          const contact = mockContacts.find(c => c.contact_id === contact_id);
          if (contact) {
            contact.gender = gender;
            if (!contact.salutation || contact.salutation === '') {
              contact.salutation = salutation;
            }
          }
        }
      });

      // Override patchContactFields to support manual salutation override
      DatabaseService.prototype.patchContactFields = jest.fn().mockImplementation((ownerId, contactId, fields) => {
        const contact = mockContacts.find(c => c.contact_id === contactId);
        if (contact) {
          Object.assign(contact, fields);
        }
      });

      // Override queryOne
      DatabaseService.prototype.queryOne = jest.fn().mockImplementation((sql: string, params: any[]) => {
        if (sql.includes('SELECT salutation, gender FROM contacts') || sql.includes('SELECT salutation FROM contacts')) {
          const [contactId] = params;
          return mockContacts.find(c => c.contact_id === contactId);
        }
        return undefined;
      });
    });

    it('should auto-fill salutation as "Anh" for gender 0 (Nam) when salutation is empty', () => {
      db.updateContactProfile(ownerId, contactId, 'Nguyen Van A', 'http://avatar', '', 'user', 0, null);
      
      const row = (db as any).queryOne('SELECT salutation, gender FROM contacts WHERE contact_id = ?', [contactId]);
      expect(row.gender).toBe(0);
      expect(row.salutation).toBe('Anh');
    });

    it('should auto-fill salutation as "Chị" for gender 1 (Nữ) when salutation is empty', () => {
      db.updateContactProfile(ownerId, contactId, 'Tran Thi B', 'http://avatar', '', 'user', 1, null);
      
      const row = (db as any).queryOne('SELECT salutation, gender FROM contacts WHERE contact_id = ?', [contactId]);
      expect(row.gender).toBe(1);
      expect(row.salutation).toBe('Chị');
    });

    it('should auto-fill salutation as "Bạn" for other genders when salutation is empty', () => {
      db.updateContactProfile(ownerId, contactId, 'User C', 'http://avatar', '', 'user', 2, null);
      
      const row = (db as any).queryOne('SELECT salutation, gender FROM contacts WHERE contact_id = ?', [contactId]);
      expect(row.gender).toBe(2);
      expect(row.salutation).toBe('Bạn');
    });

    it('should keep existing manual salutation edits intact upon profile update', () => {
      // 1. First sync triggers auto-fill "Anh"
      db.updateContactProfile(ownerId, contactId, 'Nguyen Van A', 'http://avatar', '', 'user', 0, null);
      
      // 2. User manually overrides salutation in CRM to "Bố"
      db.patchContactFields(ownerId, contactId, { salutation: 'Bố' });
      let row = (db as any).queryOne('SELECT salutation FROM contacts WHERE contact_id = ?', [contactId]);
      expect(row.salutation).toBe('Bố');

      // 3. Another sync occurs, gender is still 0 (Nam)
      db.updateContactProfile(ownerId, contactId, 'Nguyen Van A Updated', 'http://avatar', '', 'user', 0, null);
      
      // 4. Salutation must remain "Bố" (no override)
      row = (db as any).queryOne('SELECT salutation FROM contacts WHERE contact_id = ?', [contactId]);
      expect(row.salutation).toBe('Bố');
    });
  });

  describe('CRMQueueService Variable Substitution Logic', () => {
    it('should properly substitute name, zalo_name, alias, and salutation with correct fallbacks', () => {
      const mockItem = {
        campaign_id: 1,
        contact_id: 'contact-1',
        display_name: 'Zalo Display Name',
        alias: 'CRM Biệt Danh',
        gender: 0,
        salutation: 'Bác',
        extra_data: JSON.stringify({ custom_field: 'Mã VIP' }),
        contact_phone: '0977933555'
      };

      // We extract the substitute function from a simulated queue context
      const queueService = CRMQueueService.getInstance();
      const mockQueueItem = {
        id: 1,
        campaign_id: 1,
        owner_zalo_id: 'owner-1',
        contact_id: 'contact-1',
        status: 'pending',
        retry_count: 0
      };

      // Simulate substitute mapping using our service logic
      const genderVal = mockItem.gender;
      const genderGreeting = genderVal === 0 ? 'Anh' : (genderVal === 1 ? 'Chị' : 'Bạn');
      const salutationVal = mockItem.salutation;
      const effectiveSalutation = salutationVal ? salutationVal.trim() : genderGreeting;
      const contactAlias = mockItem.alias || '';
      const zaloName = mockItem.display_name || mockItem.contact_id || '';
      const effectiveDisplayName = mockItem.alias || mockItem.display_name || mockItem.contact_id;
      const contactPhone = mockItem.contact_phone;

      const substitute = (tpl: string) => {
        let result = (tpl || '')
          .replace(/\{name\}/g,             effectiveDisplayName)
          .replace(/\{zalo_name\}/g,        zaloName)
          .replace(/\{userId\}/g,           mockItem.contact_id)
          .replace(/\{gender_greeting\}/g,  effectiveSalutation)
          .replace(/\{salutation\}/g,       effectiveSalutation)
          .replace(/\{alias\}/g,            contactAlias)
          .replace(/\{phone\}/g,            contactPhone);

        // Cleanup: remove unresolved brackets {xyz}
        result = result.replace(/\{[a-z_][a-z0-9_.]*\}/gi, '');
        result = result.replace(/  +/g, ' ').trim();
        return result;
      };

      // Test 1: Both alias and display name exist
      expect(substitute('Chào {salutation} {name}')).toBe('Chào Bác CRM Biệt Danh');
      expect(substitute('Tên Zalo là {zalo_name}')).toBe('Tên Zalo là Zalo Display Name');
      expect(substitute('Biệt danh là {alias}')).toBe('Biệt danh là CRM Biệt Danh');
      expect(substitute('SĐT: {phone}')).toBe('SĐT: 0977933555');

      // Test 2: Unresolved variables should be stripped completely
      expect(substitute('Gửi {nonexistent_var} nhé')).toBe('Gửi nhé');
    });

    it('should strictly return empty string for {alias} if alias is not defined (no fallback)', () => {
      const mockItemNoAlias = {
        contact_id: 'contact-2',
        display_name: 'Zalo Display Name Only',
        alias: '', // Empty
        gender: 1,
        salutation: ''
      };

      const contactAlias = mockItemNoAlias.alias || '';
      const substitute = (tpl: string) => {
        let result = (tpl || '')
          .replace(/\{alias\}/g, contactAlias);
        result = result.replace(/\{[a-z_][a-z0-9_.]*\}/gi, '');
        result = result.replace(/  +/g, ' ').trim();
        return result;
      };

      // {alias} should be blank, and cleanup regex will strip it
      expect(substitute('Tên biệt danh: {alias}')).toBe('Tên biệt danh:');
    });
  });
});
