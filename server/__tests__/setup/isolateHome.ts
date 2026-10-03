import * as fs from 'fs';
import { createRequire, syncBuiltinESMExports } from 'module';
import * as path from 'path';

// Tests redirect the home directory by setting process.env.HOME, but on Windows
// os.homedir() reads USERPROFILE, so those tests read and wrote the developer's
// real ~/.pixel-agents and ~/.claude. Start every test file in a throwaway home
// (child processes inherit it via USERPROFILE) and make os.homedir() follow HOME.
// The mutable CommonJS `os` object is patched, then synced into ESM imports.
const os = createRequire(path.join(process.cwd(), 'noop.js'))('os') as typeof import('os');

const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-test-home-'));
process.env.HOME = isolatedHome;
process.env.USERPROFILE = isolatedHome;

const realHomedir = os.homedir;
os.homedir = () => process.env.HOME || realHomedir();
syncBuiltinESMExports();
