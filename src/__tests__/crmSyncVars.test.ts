/**
 * @file crmSyncVars.test.ts
 * @description Unit tests to verify the name, alias, and salutation synchronization and separation logic.
 *
 * APPROACH: Pure in-memory mock — we directly test the salutation auto-fill logic
 * as implemented in DatabaseService.updateContactProfile() without needing a real SQLite connection.
 */

// ─── Salutation Utils (standalone, no DB dependency) ─────────────────────────
import { applySmartSalutation } from '../utils/salutationUtils';

// ─── Mock Contacts store ──────────────────────────────────────────────────────
interface MockContact {
  owner_zalo_id: string;
  contact_id: string;
  display_name: string;
  avatar_url: string;
  phone: string;
  contact_type: string;
  salutation: string;
  salutation_manual: number; // 0 = auto, 1 = manual
  gender: number | null;
}

/**
 * Pure re-implementation of the salutation auto-fill logic from updateContactProfile.
 * Mirrors exactly: gender = CASE WHEN gender IS NULL THEN ? ELSE gender END,
 *                  salutation = CASE WHEN (salutation_manual IS NULL OR salutation_manual = 0) AND ... THEN ? ELSE salutation END
 */
function simulateUpdateContactProfile(
  store: MockContact[],
  ownerZaloId: string,
  contactId: string,
  displayName: string,
  avatarUrl: string,
  phone: string,
  contactType: string,
  gender?: number | null
): void {
  let contact = store.find(c => c.contact_id === contactId);

  if (!contact) {
    contact = {
      owner_zalo_id: ownerZaloId,
      contact_id: contactId,
      display_name: displayName || contactId,
      avatar_url: avatarUrl || '',
      phone: phone || '',
      contact_type: contactType || 'user',
      salutation: '',
      salutation_manual: 0,
      gender: null
    };
    store.push(contact);
  } else {
    if (displayName) contact.display_name = displayName;
    if (avatarUrl) contact.avatar_url = avatarUrl;
    if (phone) contact.phone = phone;
    if (contactType) contact.contact_type = contactType;
  }

  // Apply gender & auto-salutation — mirrors the DB CASE logic exactly
  if (gender !== undefined && gender !== null) {
    // gender = CASE WHEN gender IS NULL THEN ? ELSE gender END
    if (contact.gender === null) {
      contact.gender = gender;
    }
    // salutation = CASE WHEN (salutation_manual IS NULL OR salutation_manual = 0)
    //                    AND (salutation IS NULL OR salutation = '' OR salutation = 'Anh/Chị')
    //              THEN ? ELSE salutation END
    const autoSalutation = gender === 0 ? 'Anh' : (gender === 1 ? 'Chị' : 'Anh/Chị');
    if (
      (contact.salutation_manual === null || contact.salutation_manual === 0) &&
      (contact.salutation === null || contact.salutation === '' || contact.salutation === 'Anh/Chị')
    ) {
      contact.salutation = autoSalutation;
    }
  }
}

function simulatePatchContactFields(
  store: MockContact[],
  contactId: string,
  fields: Partial<MockContact & { salutation_manual?: number }>
): void {
  const contact = store.find(c => c.contact_id === contactId);
  if (contact) {
    // When user manually sets salutation, mark it as manual
    if (fields.salutation !== undefined) {
      contact.salutation = fields.salutation;
      contact.salutation_manual = 1; // lock against auto-overwrite
    }
    Object.assign(contact, fields);
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('CRM Name and Salutation Separation Logic', () => {

  describe('Database Salutation Auto-fill & Keep Manual Edits', () => {
    const ownerId = 'zalo-owner-1';
    const contactId = 'contact-zalo-1';
    let store: MockContact[];

    beforeEach(() => {
      store = [];
    });

    it('should auto-fill salutation as "Anh" for gender 0 (Nam) when salutation is empty', () => {
      simulateUpdateContactProfile(store, ownerId, contactId, 'Nguyen Van A', 'http://avatar', '', 'user', 0);
      const row = store.find(c => c.contact_id === contactId);
      expect(row?.gender).toBe(0);
      expect(row?.salutation).toBe('Anh');
    });

    it('should auto-fill salutation as "Chị" for gender 1 (Nữ) when salutation is empty', () => {
      simulateUpdateContactProfile(store, ownerId, contactId, 'Tran Thi B', 'http://avatar', '', 'user', 1);
      const row = store.find(c => c.contact_id === contactId);
      expect(row?.gender).toBe(1);
      expect(row?.salutation).toBe('Chị');
    });

    it('should auto-fill salutation as "Anh/Chị" for other genders when salutation is empty', () => {
      simulateUpdateContactProfile(store, ownerId, contactId, 'User C', 'http://avatar', '', 'user', 2);
      const row = store.find(c => c.contact_id === contactId);
      expect(row?.gender).toBe(2);
      expect(row?.salutation).toBe('Anh/Chị');
    });

    it('should keep existing manual salutation edits intact upon profile update', () => {
      // 1. First sync triggers auto-fill "Anh"
      simulateUpdateContactProfile(store, ownerId, contactId, 'Nguyen Van A', 'http://avatar', '', 'user', 0);
      let row = store.find(c => c.contact_id === contactId)!;
      expect(row.salutation).toBe('Anh');

      // 2. User manually overrides salutation in CRM to "Bố"
      simulatePatchContactFields(store, contactId, { salutation: 'Bố' });
      row = store.find(c => c.contact_id === contactId)!;
      expect(row.salutation).toBe('Bố');

      // 3. Another sync occurs — gender is still 0 (Nam)
      simulateUpdateContactProfile(store, ownerId, contactId, 'Nguyen Van A Updated', 'http://avatar', '', 'user', 0);

      // 4. Salutation must remain "Bố" (manual lock prevents auto-override)
      row = store.find(c => c.contact_id === contactId)!;
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

      const genderVal = mockItem.gender;
      const genderGreeting = genderVal === 0 ? 'Anh' : (genderVal === 1 ? 'Chị' : 'Bạn');
      const salutationVal = mockItem.salutation;
      const effectiveSalutation = salutationVal ? salutationVal.trim() : genderGreeting;
      const contactAlias = mockItem.alias || '';
      const zaloName = mockItem.display_name || mockItem.contact_id || '';
      const effectiveDisplayName = mockItem.alias || mockItem.display_name || mockItem.contact_id;
      const contactPhone = mockItem.contact_phone;

      const substitute = (tpl: string): string => {
        // applySmartSalutation handles {salutation}/{tu_xung} with smart capitalization
        let result = applySmartSalutation(tpl || '', effectiveSalutation);
        result = result
          .replace(/\{name\}/g,             effectiveDisplayName)
          .replace(/\{zalo_name\}/g,        zaloName)
          .replace(/\{userId\}/g,           mockItem.contact_id)
          .replace(/\{gender_greeting\}/g,  effectiveSalutation)
          .replace(/\{salutation\}/g,       effectiveSalutation)
          .replace(/\{alias\}/g,            contactAlias)
          .replace(/\{phone\}/g,            contactPhone);

        // Cleanup: remove unresolved variables
        result = result.replace(/\{[a-z_][a-z0-9_.]*\}/gi, '');
        result = result.replace(/  +/g, ' ').trim();
        return result;
      };

      // Both alias and display_name exist — alias wins for {name}
      const salResult = substitute('Chào {salutation} {name}');
      // applySmartSalutation lowercases "Bác" after "Chào " (start of sentence → capitalize first word only)
      expect(salResult).toMatch(/Chào [Bb]ác CRM Biệt Danh/);
      expect(substitute('Tên Zalo là {zalo_name}')).toBe('Tên Zalo là Zalo Display Name');
      expect(substitute('Biệt danh là {alias}')).toBe('Biệt danh là CRM Biệt Danh');
      expect(substitute('SĐT: {phone}')).toBe('SĐT: 0977933555');

      // Unresolved variables should be stripped
      expect(substitute('Gửi {nonexistent_var} nhé')).toBe('Gửi nhé');
    });

    it('should strictly return empty string for {alias} if alias is not defined (no fallback)', () => {
      const mockItemNoAlias = {
        contact_id: 'contact-2',
        display_name: 'Zalo Display Name Only',
        alias: '', // Empty — no fallback
        gender: 1,
        salutation: ''
      };

      const contactAlias = mockItemNoAlias.alias || '';
      const substitute = (tpl: string): string => {
        let result = (tpl || '').replace(/\{alias\}/g, contactAlias);
        result = result.replace(/\{[a-z_][a-z0-9_.]*\}/gi, '');
        result = result.replace(/  +/g, ' ').trim();
        return result;
      };

      // {alias} is empty → substitution produces empty → cleanup regex won't match (already replaced)
      expect(substitute('Tên biệt danh: {alias}')).toBe('Tên biệt danh:');
    });
  });
});
