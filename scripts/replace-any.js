const fs = require('fs');
const path = require('path');

const preloadPath = path.join(__dirname, '../electron/preload.ts');
const ipcPath = path.join(__dirname, '../src/ui/lib/ipc.ts');

function refactorFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let originalLength = content.length;

  // Replace parameter declarations:
  // (params: any) -> (params: unknown)
  // (auth: any) -> (auth: unknown)
  // (data: any) -> (data: unknown)
  // (args: any) -> (args: unknown)
  // (channel: string, callback: (...args: any[]) => void) -> callback: (...args: unknown[])
  // (channel: string, subscription: (_event: any, ...args: any[]) => void) -> subscription: (_event: unknown, ...args: unknown[])

  content = content.replace(/\((params|auth|data|args|options|config|query|payload|body|variables|event|msgIds|campaign|contact|row|item):\s*any\)/g, '($1: unknown)');
  content = content.replace(/\((params|auth|data|args|options|config|query|payload|body|variables|event|msgIds|campaign|contact|row|item)\?\s*:\s*any\)/g, '($1?: unknown)');
  content = content.replace(/:\s*any\s*=>/g, ': unknown =>');
  content = content.replace(/\.\.\.args:\s*any\[\]/g, '...args: unknown[]');
  content = content.replace(/_event:\s*any/g, '_event: unknown');

  // Let's also check for callback parameters in general declarations
  // e.g. callback: (...args: any[]) => void -> callback: (...args: unknown[]) => void
  content = content.replace(/:\s*\(\.\.\.args:\s*any\[\]\)\s*=>/g, ': (...args: unknown[]) =>');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Refactored ${path.basename(filePath)}. Length: ${originalLength} -> ${content.length}`);
}

refactorFile(preloadPath);
refactorFile(ipcPath);
