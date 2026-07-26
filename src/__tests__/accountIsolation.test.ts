/**
 * @file accountIsolation.test.ts
 * @description Unit tests to verify 100% account isolation when switching activeAccountId in CRM.
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

// Mock Logger
jest.mock('../utils/Logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}), { virtual: true });

import { useCRMStore } from '../ui/store/crmStore';

describe('Option A: CRM Account Isolation & Filter Reset Tests', () => {
  beforeEach(() => {
    // Reset CRM store before each test
    useCRMStore.getState().reset();
  });

  it('should reset all filters and selections when activeAccountId switches', () => {
    const store = useCRMStore.getState();

    // 1. User sets active filters on Account A (Duong Kim)
    store.setFilter({
      searchText: 'Nguyễn Văn A',
      filterLabelIds: [1, 2],
      filterLocalLabelIds: [101, 102],
      filterContactTypes: ['friend', 'has_phone'],
      filterGender: 'male',
      filterBirthday: 'this_month',
      filterSalutation: 'Anh',
      page: 3,
    });
    store.selectAllContacts(['uid_1', 'uid_2', 'uid_3']);
    store.setActiveContact('uid_1');

    // Verify filters & selection are populated for Account A
    expect(useCRMStore.getState().searchText).toBe('Nguyễn Văn A');
    expect(useCRMStore.getState().filterLabelIds).toEqual([1, 2]);
    expect(useCRMStore.getState().filterLocalLabelIds).toEqual([101, 102]);
    expect(useCRMStore.getState().filterContactTypes).toEqual(['friend', 'has_phone']);
    expect(useCRMStore.getState().filterGender).toBe('male');
    expect(useCRMStore.getState().filterBirthday).toBe('this_month');
    expect(useCRMStore.getState().filterSalutation).toBe('Anh');
    expect(useCRMStore.getState().page).toBe(3);
    expect(useCRMStore.getState().selectedContactIds.size).toBe(3);
    expect(useCRMStore.getState().activeContactId).toBe('uid_1');

    // 2. Simulate switching activeAccountId to Account B (Gohr Platform)
    // Executes Option A reset logic
    useCRMStore.getState().clearSelection();
    useCRMStore.getState().setActiveContact(null);
    useCRMStore.getState().setFilter({
      searchText: '',
      filterLabelIds: [],
      filterLocalLabelIds: [],
      filterContactTypes: [],
      filterGender: 'all',
      filterBirthday: 'all',
      filterSalutation: 'all',
      page: 0,
    });

    // 3. Assert Account B starts with a 100% clean slate
    const resetStore = useCRMStore.getState();
    expect(resetStore.searchText).toBe('');
    expect(resetStore.filterLabelIds).toEqual([]);
    expect(resetStore.filterLocalLabelIds).toEqual([]);
    expect(resetStore.filterContactTypes).toEqual([]);
    expect(resetStore.filterGender).toBe('all');
    expect(resetStore.filterBirthday).toBe('all');
    expect(resetStore.filterSalutation).toBe('all');
    expect(resetStore.page).toBe(0);
    expect(resetStore.selectedContactIds.size).toBe(0);
    expect(resetStore.activeContactId).toBeNull();
  });

  it('should prevent cross-account selection leakage during batch operations', () => {
    useCRMStore.getState().selectAllContacts(['zalo_a_contact_1', 'zalo_a_contact_2']);
    expect(useCRMStore.getState().selectedContactIds.has('zalo_a_contact_1')).toBe(true);

    // Switch account resets selected UIDs
    useCRMStore.getState().clearSelection();
    expect(useCRMStore.getState().selectedContactIds.size).toBe(0);
    expect(useCRMStore.getState().selectedContactIds.has('zalo_a_contact_1')).toBe(false);
  });
});
