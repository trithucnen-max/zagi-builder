import { getLunarDate } from '../utils/lunarCalendar';

describe('Lunar Calendar Conversion Tests', () => {
  test('Convert Lunar New Year 2020 (2020-01-25)', () => {
    const solarDate = new Date(2020, 0, 25); // Jan 25, 2020
    const lunar = getLunarDate(solarDate);
    expect(lunar).not.toBeNull();
    expect(lunar!.day).toBe(1);
    expect(lunar!.month).toBe(1);
    expect(lunar!.year).toBe(2020);
    expect(lunar!.isLeap).toBe(false);
  });

  test('Convert Lunar New Year 2025 (2025-01-29)', () => {
    const solarDate = new Date(2025, 0, 29); // Jan 29, 2025
    const lunar = getLunarDate(solarDate);
    expect(lunar).not.toBeNull();
    expect(lunar!.day).toBe(1);
    expect(lunar!.month).toBe(1);
    expect(lunar!.year).toBe(2025);
    expect(lunar!.isLeap).toBe(false);
  });

  test('Convert Lunar New Year 2026 (2026-02-17)', () => {
    const solarDate = new Date(2026, 1, 17); // Feb 17, 2026
    const lunar = getLunarDate(solarDate);
    expect(lunar).not.toBeNull();
    expect(lunar!.day).toBe(1);
    expect(lunar!.month).toBe(1);
    expect(lunar!.year).toBe(2026);
    expect(lunar!.isLeap).toBe(false);
  });

  test('Convert regular lunar date (2024-06-24)', () => {
    const solarDate = new Date(2024, 5, 24); // Jun 24, 2024
    const lunar = getLunarDate(solarDate);
    expect(lunar).not.toBeNull();
    // 2024-06-24 is lunar 19th of May 2024
    expect(lunar!.day).toBe(19);
    expect(lunar!.month).toBe(5);
    expect(lunar!.year).toBe(2024);
  });
});
