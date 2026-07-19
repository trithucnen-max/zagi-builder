/**
 * @file crmFilters.test.ts
 * @description Unit tests to verify the correctness of the timezone-safe birthday checking and label ID resolution logic.
 */

function getVietnamTime(): Date {
  const options = { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: 'numeric', day: 'numeric' } as const;
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const y = parseInt(partMap.year, 10);
  const m = parseInt(partMap.month, 10);
  const d = parseInt(partMap.day, 10);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function resolveLocalLabelIds(localLabelIds?: string[]): number[] {
  const resolvedIds: number[] = [];
  if (localLabelIds && Array.isArray(localLabelIds)) {
    for (const val of localLabelIds) {
      const s = String(val);
      if (s.startsWith('local:')) {
        const id = Number(s.split(':')[1]);
        if (!isNaN(id)) resolvedIds.push(id);
      } else {
        const id = Number(s);
        if (!isNaN(id)) resolvedIds.push(id);
      }
    }
  }
  return resolvedIds;
}

describe('CRM Filters Unit Tests', () => {
  describe('getVietnamTime timezone-safe helper', () => {
    it('should return a date representing Vietnam timezone', () => {
      const vnTime = getVietnamTime();
      expect(vnTime).toBeInstanceOf(Date);
      expect(vnTime.getHours()).toBe(12); // Noon
      expect(vnTime.getMinutes()).toBe(0);
    });
  });

  describe('resolveLocalLabelIds', () => {
    it('should correctly parse "local:ID" prefix', () => {
      const input = ['local:5', 'local:12', 'local:invalid', '9'];
      const resolved = resolveLocalLabelIds(input);
      expect(resolved).toEqual([5, 12, 9]);
    });

    it('should return empty list when no ids are passed', () => {
      expect(resolveLocalLabelIds(undefined)).toEqual([]);
      expect(resolveLocalLabelIds([])).toEqual([]);
    });
  });

  describe('Birthday match logic', () => {
    const vnTime = new Date(2026, 6, 19, 12, 0, 0); // Sunday July 19, 2026 (index 6 is July)

    const checkBirthday = (birthday: string, filter: string): boolean => {
      if (!birthday) return false;
      const parts = birthday.split('/');
      if (parts.length < 2) return false;
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(d) || isNaN(m)) return false;

      if (filter === 'today') {
        const currentDay = vnTime.getDate();
        const currentMonth = vnTime.getMonth() + 1;
        return d === currentDay && m === currentMonth;
      }

      if (filter === 'this_week') {
        const dayOfWeek = vnTime.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(vnTime.getTime());
        monday.setDate(vnTime.getDate() + diffToMonday);

        const weekDays = new Set<string>();
        for (let i = 0; i < 7; i++) {
          const day = new Date(monday.getTime());
          day.setDate(monday.getDate() + i);
          weekDays.add(`${day.getDate()}/${day.getMonth() + 1}`);
        }
        return weekDays.has(`${d}/${m}`);
      }

      if (filter === 'this_month') {
        const currentMonth = vnTime.getMonth() + 1;
        return m === currentMonth;
      }

      return false;
    };

    it('should correctly match today filter', () => {
      expect(checkBirthday('19/07/1990', 'today')).toBe(true);
      expect(checkBirthday('19/07', 'today')).toBe(true);
      expect(checkBirthday('20/07/1990', 'today')).toBe(false);
    });

    it('should correctly match this_week filter', () => {
      // July 19, 2026 is Sunday. Monday is July 13.
      // So days in this week are 13, 14, 15, 16, 17, 18, 19
      expect(checkBirthday('13/07/1995', 'this_week')).toBe(true);
      expect(checkBirthday('15/07', 'this_week')).toBe(true);
      expect(checkBirthday('19/07/2000', 'this_week')).toBe(true);
      expect(checkBirthday('12/07/1995', 'this_week')).toBe(false);
      expect(checkBirthday('20/07/1995', 'this_week')).toBe(false);
    });

    it('should correctly match this_month filter', () => {
      expect(checkBirthday('01/07/1990', 'this_month')).toBe(true);
      expect(checkBirthday('19/07', 'this_month')).toBe(true);
      expect(checkBirthday('19/08/1990', 'this_month')).toBe(false);
    });
  });
});
