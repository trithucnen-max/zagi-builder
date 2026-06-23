/**
 * Vietnamese Lunar Calendar Converter (Dương lịch sang Âm lịch Việt Nam)
 * Based on Ho Ngoc Duc's astronomical formulas and lookup database for Vietnam timezone (UTC+7).
 */

// Years 1900-1999
const TK20 = [
  0x3c4bd8, 0x624ae0, 0x4ca570, 0x3854d5, 0x5cd260, 0x44d950, 0x315554, 0x5656a0, 0x409ad0, 0x2a55d2,
  0x504ae0, 0x3aa5b6, 0x60a4d0, 0x48d250, 0x33d255, 0x58b540, 0x42d6a0, 0x2cada2, 0x5295b0, 0x3f4977,
  0x644970, 0x4ca4b0, 0x36b4b5, 0x5c6a50, 0x466d50, 0x312b54, 0x562b60, 0x409570, 0x2c52f2, 0x504970,
  0x3a6566, 0x5ed4a0, 0x48ea50, 0x336a95, 0x585ad0, 0x442b60, 0x2f86e3, 0x5292e0, 0x3dc8d7, 0x62c950,
  0x4cd4a0, 0x35d8a6, 0x5ab550, 0x4656a0, 0x31a5b4, 0x5625d0, 0x4092d0, 0x2ad2b2, 0x50a950, 0x38b557,
  0x5e6ca0, 0x48b550, 0x355355, 0x584da0, 0x42a5b0, 0x2f4573, 0x5452b0, 0x3ca9a8, 0x60e950, 0x4c6aa0,
  0x36aea6, 0x5aab50, 0x464b60, 0x30aae4, 0x56a570, 0x405260, 0x28f263, 0x4ed940, 0x38db47, 0x5cd6a0,
  0x4896d0, 0x344dd5, 0x5a4ad0, 0x42a4d0, 0x2cd4b4, 0x52b250, 0x3cd558, 0x60b540, 0x4ab5a0, 0x3755a6,
  0x5c95b0, 0x4649b0, 0x30a974, 0x56a4b0, 0x40aa50, 0x29aa52, 0x4e6d20, 0x39ad47, 0x5eab60, 0x489370,
  0x344af5, 0x5a4970, 0x4464b0, 0x2c74a3, 0x50ea50, 0x3d6a58, 0x6256a0, 0x4aaad0, 0x3696d5, 0x5c92e0
];

// Years 2000-2099
const TK21 = [
  0x46c960, 0x2ed954, 0x54d4a0, 0x3eda50, 0x2a7552, 0x4e56a0, 0x38a7a7, 0x5ea5d0, 0x4a92b0, 0x32aab5,
  0x58a950, 0x42b4a0, 0x2cbaa4, 0x50ad50, 0x3c55d9, 0x624ba0, 0x4ca5b0, 0x375176, 0x5c5270, 0x466930,
  0x307934, 0x546aa0, 0x3ead50, 0x2a5b52, 0x504b60, 0x38a6e6, 0x5ea4e0, 0x48d260, 0x32ea65, 0x56d520,
  0x40daa0, 0x2d56a3, 0x5256d0, 0x3c4afb, 0x6249d0, 0x4ca4d0, 0x37d0b6, 0x5ab250, 0x44b520, 0x2edd25,
  0x54b5a0, 0x3e55d0, 0x2a55b2, 0x5049b0, 0x3aa577, 0x5ea4b0, 0x48aa50, 0x33b255, 0x586d20, 0x40ad60,
  0x2d4b63, 0x525370, 0x3e49e8, 0x60c970, 0x4c54b0, 0x3768a6, 0x5ada50, 0x445aa0, 0x2fa6a4, 0x54aad0,
  0x4052e0, 0x28d2e3, 0x4ec950, 0x38d557, 0x5ed4a0, 0x46d950, 0x325d55, 0x5856a0, 0x42a6d0, 0x2c55d4,
  0x5252b0, 0x3ca9b8, 0x62a930, 0x4ab490, 0x34b6a6, 0x5aad50, 0x4655a0, 0x2eab64, 0x54a570, 0x4052b0,
  0x2ab173, 0x4e6930, 0x386b37, 0x5e6aa0, 0x48ad50, 0x332ad5, 0x582b60, 0x42a570, 0x2e52e4, 0x50d160,
  0x3ae958, 0x60d520, 0x4ada90, 0x355aa6, 0x5a56d0, 0x462ae0, 0x30a9d4, 0x54a2d0, 0x3ed150, 0x28e952
];

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  isLeap: boolean;
}

// Compute Julian Day from Solar date
function jdn(dd: number, mm: number, yy: number): number {
  const a = Math.floor((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  return dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

interface DecodedMonth {
  day: number;
  month: number;
  year: number;
  leap: number;
  jd: number;
}

function decodeLunarYear(yy: number, k: number): DecodedMonth[] {
  const monthLengths = [29, 30];
  const regularMonths = new Array(12);
  const offsetOfTet = k >> 17;
  const leapMonth = k & 0xf;
  const leapMonthLength = monthLengths[(k >> 16) & 0x1];
  const solarNY = jdn(1, 1, yy);
  let currentJD = solarNY + offsetOfTet;
  let j = k >> 4;

  for (let i = 0; i < 12; i++) {
    regularMonths[12 - i - 1] = monthLengths[j & 0x1];
    j >>= 1;
  }

  const ly: DecodedMonth[] = [];
  if (leapMonth === 0) {
    for (let mm = 1; mm <= 12; mm++) {
      ly.push({ day: 1, month: mm, year: yy, leap: 0, jd: currentJD });
      currentJD += regularMonths[mm - 1];
    }
  } else {
    for (let mm = 1; mm <= leapMonth; mm++) {
      ly.push({ day: 1, month: mm, year: yy, leap: 0, jd: currentJD });
      currentJD += regularMonths[mm - 1];
    }
    ly.push({ day: 1, month: leapMonth, year: yy, leap: 1, jd: currentJD });
    currentJD += leapMonthLength;
    for (let mm = leapMonth + 1; mm <= 12; mm++) {
      ly.push({ day: 1, month: mm, year: yy, leap: 0, jd: currentJD });
      currentJD += regularMonths[mm - 1];
    }
  }
  return ly;
}

export function getLunarDate(solarDate: Date): LunarDate | null {
  const year = solarDate.getFullYear();
  const month = solarDate.getMonth() + 1;
  const day = solarDate.getDate();

  if (year < 1900 || year > 2099) {
    return null;
  }

  const jd = jdn(day, month, year);

  // Get data for current solar year
  let lyYear = year;
  let k = lyYear >= 2000 ? TK21[lyYear - 2000] : TK20[lyYear - 1900];
  let ly = decodeLunarYear(lyYear, k);

  // If Julian day is before Lunar New Year of current solar year, it belongs to the previous lunar year
  if (jd < ly[0].jd) {
    lyYear--;
    if (lyYear < 1900) return null;
    k = lyYear >= 2000 ? TK21[lyYear - 2000] : TK20[lyYear - 1900];
    ly = decodeLunarYear(lyYear, k);
  }

  // Find the matching lunar month
  let matchedIndex = -1;
  for (let i = 0; i < ly.length; i++) {
    if (jd >= ly[i].jd && (i === ly.length - 1 || jd < ly[i + 1].jd)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    matchedIndex = ly.length - 1;
  }

  const matched = ly[matchedIndex];
  const lunarDay = jd - matched.jd + 1;

  return {
    day: lunarDay,
    month: matched.month,
    year: lyYear,
    isLeap: matched.leap === 1
  };
}
