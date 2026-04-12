/**
 * Create a new Firebase project, register a Web app, enable Firestore (default DB),
 * and write client config into src/firebase/config.js + .firebaserc
 *
 * Prerequisite: run `npm run firebase:login` once on this machine.
 *
 * Usage:
 *   node scripts/firebase-setup.mjs <project-id>
 *
 * Project ID rules: 6–30 chars, lowercase letters, digits, hyphen (globally unique).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fb = 'npx firebase-tools@13';

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', shell: true, cwd: root, ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf8', shell: true, cwd: root });
}

const projectId = process.argv[2]?.trim();
if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
  console.error(`
Invalid or missing project ID.

Usage:
  npm run firebase:setup -- <project-id>

Example:
  npm run firebase:setup -- cellapp-prod-a3f9
`);
  process.exit(1);
}

console.log('\n→ Checking Firebase CLI login…');
try {
  runCapture(`${fb} projects:list --json`);
} catch {
  console.error(`
Not logged in. Run first:
  npm run firebase:login

Then re-run this command.
`);
  process.exit(1);
}

console.log(`\n→ Creating Firebase / GCP project "${projectId}"…`);
try {
  run(`${fb} projects:create ${projectId} --display-name "Cell App"`);
} catch (e) {
  console.error(
    '\nIf the project ID is taken, pick another. If the project already exists, continuing…\n'
  );
}

console.log('\n→ Creating default Firestore database (location: nam5, multi-region US)…');
try {
  run(
    `${fb} firestore:databases:create "(default)" --location nam5 --project ${projectId}`
  );
} catch {
  console.warn(
    '⚠️  Firestore DB creation skipped or failed (maybe it already exists). Enable in console if needed: Firestore → Create database\n'
  );
}

console.log('\n→ Registering Web app…');
run(`${fb} apps:create WEB "Cell App Web" --project ${projectId}`);

console.log('\n→ Fetching Web SDK config…');

let appIdArg;
try {
  const listJson = JSON.parse(runCapture(`${fb} --json apps:list WEB --project ${projectId}`));
  const apps = listJson.result || listJson;
  const row = Array.isArray(apps) ? apps[0] : apps?.apps?.[0];
  appIdArg = row?.appId || row?.app_id;
} catch {
  appIdArg = undefined;
}

/** Normalize firebase apps:sdkconfig JSON (shape varies by CLI version). */
function extractWebFields(parsed, fallbackProjectId) {
  const flat = parsed.sdkConfig || parsed.result || parsed;
  if (flat.apiKey && flat.projectId) {
    return {
      apiKey: flat.apiKey,
      authDomain: flat.authDomain,
      projectId: flat.projectId,
      storageBucket: flat.storageBucket,
      messagingSenderId: String(flat.messagingSenderId || ''),
      appId: flat.appId,
      measurementId: flat.measurementId
    };
  }
  const web = flat.web;
  if (web?.apiKey) {
    return {
      apiKey: web.apiKey,
      authDomain: web.authDomain,
      projectId: web.projectId,
      storageBucket: web.storageBucket,
      messagingSenderId: String(web.messagingSenderId || ''),
      appId: web.appId,
      measurementId: web.measurementId
    };
  }
  const client = Array.isArray(flat.client) ? flat.client[0] : flat.client;
  const info = client?.client_info || {};
  const apiKey =
    (Array.isArray(client?.api_key) && client.api_key[0]?.current_key) || client?.api_key;
  const pinfo = flat.project_info || {};
  return {
    apiKey,
    authDomain: `${pinfo.project_id || fallbackProjectId}.firebaseapp.com`,
    projectId: pinfo.project_id || fallbackProjectId,
    storageBucket: pinfo.storage_bucket || `${pinfo.project_id || fallbackProjectId}.appspot.com`,
    messagingSenderId: String(pinfo.project_number || ''),
    appId: info.mobilesdk_app_id,
    measurementId: undefined
  };
}

const sdkconfigCmd = appIdArg
  ? `${fb} apps:sdkconfig WEB ${appIdArg} --project ${projectId}`
  : `${fb} apps:sdkconfig WEB --project ${projectId}`;

let sdk;
try {
  const raw = runCapture(`${sdkconfigCmd} --json`);
  sdk = JSON.parse(raw);
} catch {
  try {
    const tmp = path.join(root, '.firebase-sdkconfig-tmp.json');
    run(`${sdkconfigCmd} -o ${tmp}`);
    const body = fs.readFileSync(tmp, 'utf8');
    fs.unlinkSync(tmp);
    sdk = JSON.parse(body);
  } catch {
    const raw = runCapture(sdkconfigCmd);
    const m = raw.match(/\{[\s\S]*"apiKey"[\s\S]*\}/);
    if (!m) throw new Error('Could not read SDK config');
    sdk = JSON.parse(m[0]);
  }
}

const webFields = extractWebFields(sdk, projectId);
const apiKey = webFields.apiKey;
const authDomain = webFields.authDomain;
const pid = webFields.projectId || projectId;
const storageBucket = webFields.storageBucket || `${pid}.firebasestorage.app`;
const messagingSenderId = webFields.messagingSenderId;
const appId = webFields.appId;
const measurementId = webFields.measurementId;

if (!apiKey || !pid || !appId) {
  console.error('Unexpected SDK response:', JSON.stringify(sdk, null, 2));
  throw new Error('Missing fields in SDK config. Check Firebase Console → Project settings.');
}

const configJs = `// Firebase configuration (generated by scripts/firebase-setup.mjs)
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: ${JSON.stringify(apiKey)},
  authDomain: ${JSON.stringify(authDomain || `${pid}.firebaseapp.com`)},
  projectId: ${JSON.stringify(pid)},
  storageBucket: ${JSON.stringify(storageBucket)},
  messagingSenderId: ${JSON.stringify(String(messagingSenderId || ''))},
  appId: ${JSON.stringify(appId)}${measurementId ? `,\n  measurementId: ${JSON.stringify(measurementId)}` : ''}
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

export default app;
`;

const configPath = path.join(root, 'src', 'firebase', 'config.js');
fs.writeFileSync(configPath, configJs, 'utf8');
console.log(`✅ Wrote ${path.relative(root, configPath)}`);

const firebaserc = { projects: { default: pid } };
fs.writeFileSync(
  path.join(root, '.firebaserc'),
  JSON.stringify(firebaserc, null, 2) + '\n',
  'utf8'
);
console.log('✅ Wrote .firebaserc');

console.log(`
Next steps (manual):
1. Firebase Console → Authentication → Sign-in method: enable Google (and Email/Password if you use it).
2. Firebase Console → Storage → Get started (if you use uploads).
3. Deploy rules:  npm run firebase:deploy:rules (Firestore) and npm run firebase:deploy:storage-rules (Storage), or npm run firebase:deploy:rules:all if your account can enable both APIs
4. Railway / server: set FIREBASE_PROJECT_ID=${pid} and FIREBASE_SERVICE_ACCOUNT_KEY (JSON) for Admin SDK.

Default Hosting domain for auth: add authorized domains if you use a custom domain.
`);
