#!/usr/bin/env node
/**
 * scripts/bump-version.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto version bump + CHANGELOG generation từ conventional commits.
 *
 * Usage:
 *   node scripts/bump-version.js [patch|minor|major]
 *   npm run bump         # patch (mặc định)
 *   npm run bump:minor   # minor
 *   npm run bump:major   # major
 *
 * Output:
 *   - Cập nhật version trong package.json
 *   - Sinh CHANGELOG.md (prepend bản mới lên đầu)
 *   - In git commit + tag command để chạy thủ công
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8' }).trim(); }
  catch { return ''; }
}

function semverBump(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    default:      return `${major}.${minor}.${patch + 1}`;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const bumpType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`❌ Invalid bump type: ${bumpType}. Use: patch | minor | major`);
  process.exit(1);
}

// Read current version
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const oldVersion = pkg.version;
const newVersion = semverBump(oldVersion, bumpType);

console.log(`\n🔖 Bumping version: ${oldVersion} → ${newVersion} (${bumpType})\n`);

// ── Collect commits since last tag ────────────────────────────────────────────

const lastTag = run('git describe --tags --abbrev=0 2>/dev/null') || '';
const range = lastTag ? `${lastTag}..HEAD` : '--max-count=50';
const rawCommits = run(`git log ${range} --pretty=format:"%s|||%an|||%H" --no-merges`);

const commits = rawCommits.split('\n').filter(Boolean).map(line => {
  const [subject, author, hash] = line.split('|||');
  return { subject: subject.trim(), author: author.trim(), hash: (hash || '').slice(0, 7) };
});

// Classify by conventional commit prefix
const classify = (prefix) => commits.filter(c => c.subject.match(new RegExp(`^${prefix}(\\(.*?\\))?:`)));

const features  = classify('feat');
const fixes     = classify('fix');
const perf      = classify('perf');
const refactor  = classify('refactor');
const docs      = classify('docs');
const chore     = classify('chore');

const formatList = (list) => list.map(c => `- ${c.subject.replace(/^[a-z]+(\(.*?\))?:\s*/,'').trim()} (${c.author})`).join('\n');

// ── Build changelog entry ─────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
let entry = `## [${newVersion}] — ${today}\n\n`;

if (features.length)  entry += `### ✨ Tính năng mới\n${formatList(features)}\n\n`;
if (fixes.length)     entry += `### 🐛 Sửa lỗi\n${formatList(fixes)}\n\n`;
if (perf.length)      entry += `### ⚡ Hiệu suất\n${formatList(perf)}\n\n`;
if (refactor.length)  entry += `### ♻️ Cải tiến code\n${formatList(refactor)}\n\n`;
if (docs.length)      entry += `### 📖 Tài liệu\n${formatList(docs)}\n\n`;
if (chore.length)     entry += `### 🔧 Bảo trì\n${formatList(chore)}\n\n`;
if (!features.length && !fixes.length && !perf.length && !refactor.length) {
  entry += `_Cập nhật nội bộ và bảo trì hệ thống._\n\n`;
}

// ── Write CHANGELOG.md ────────────────────────────────────────────────────────

const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : '';
const header = existing.startsWith('# CHANGELOG') ? '' : '# CHANGELOG\n\n';
fs.writeFileSync(changelogPath, header + entry + existing.replace(/^# CHANGELOG\n\n/, ''), 'utf-8');

console.log(`📝 CHANGELOG.md updated with v${newVersion} entry`);

// ── Write package.json ────────────────────────────────────────────────────────

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`📦 package.json updated: ${oldVersion} → ${newVersion}`);

// ── Print next steps ──────────────────────────────────────────────────────────

console.log(`
✅ Done! Next steps:

  git add package.json CHANGELOG.md
  git commit -m "chore: release v${newVersion}"
  git tag v${newVersion}
  git push && git push --tags

  # GitHub Actions will auto-build and create the release.
`);
