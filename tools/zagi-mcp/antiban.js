const fs = require('fs');
const path = require('path');
const { getSettings } = require('./auth');

const QUOTA_FILE = path.join(process.env.HOME, '.hermes', 'zagi-quota.json');

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function loadQuota() {
  try {
    if (fs.existsSync(QUOTA_FILE)) {
      return JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
    }
  } catch (err) {
    // ignore
  }
  return { date: getTodayString(), count: 0, logs: [] };
}

function saveQuota(quota) {
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(quota, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error('[AntiBan] Error saving quota:', err.message);
  }
}

async function applyJitter() {
  const settings = getSettings();
  const min = settings.antiBan?.minJitterMs || 1500;
  const max = settings.antiBan?.maxJitterMs || 4000;
  const delay = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(r => setTimeout(r, delay));
  return delay;
}

function checkAndIncrementStrangerQuota(targetInfo) {
  const settings = getSettings();
  const maxDaily = settings.antiBan?.maxStrangerDaily || 30;
  const today = getTodayString();
  let quota = loadQuota();

  if (quota.date !== today) {
    quota = { date: today, count: 0, logs: [] };
  }

  if (quota.count >= maxDaily) {
    return {
      allowed: false,
      error: `Hạn ngạch an toàn chống ban (Anti-Ban): Đã đạt tối đa ${maxDaily} tin nhắn người lạ trong ngày ${today}. Vui lòng thử lại vào ngày mai.`
    };
  }

  quota.count += 1;
  quota.logs.push({
    ts: new Date().toISOString(),
    target: targetInfo
  });
  saveQuota(quota);

  return { allowed: true, remaining: maxDaily - quota.count };
}

module.exports = {
  applyJitter,
  checkAndIncrementStrangerQuota
};
