import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function rulesText() {
  const rulesPath = path.join(__dirname, '..', 'firestore.rules');
  return fs.readFileSync(rulesPath, 'utf8');
}

async function main() {
  // Use a stable projectId for emulator runs; firebase emulators:exec sets FIREBASE_PROJECT.
  const projectId = process.env.FIREBASE_PROJECT || 'demo-cellapp-rules';

  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: rulesText() }
  });

  // Seed baseline data without security rules.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await adminDb.doc('users/admin').set({
      email: 'admin@example.com',
      role: 'admin',
      isAdmin: true
    });
    await adminDb.doc('users/alice').set({
      email: 'alice@example.com',
      role: 'user',
      isAdmin: false,
      subscription: 'free',
      credits: { current: 50, total: 50 },
      stripeCustomerId: null,
      stripeSubscriptionId: null
    });
    await adminDb.doc('users/bob').set({
      email: 'bob@example.com',
      role: 'user',
      isAdmin: false
    });
  });

  const alice = testEnv.authenticatedContext('alice').firestore();
  const bob = testEnv.authenticatedContext('bob').firestore();
  const admin = testEnv.authenticatedContext('admin').firestore();

  // 1) User docs: owner/admin-only read
  await assertSucceeds(alice.doc('users/alice').get());
  await assertFails(bob.doc('users/alice').get());

  // 2) User docs: owner can update profile fields, but cannot update privileged fields
  await assertSucceeds(alice.doc('users/alice').update({ displayName: 'Alice' }));
  await assertFails(alice.doc('users/alice').update({ role: 'admin' }));
  await assertFails(alice.doc('users/alice').update({ isAdmin: true }));
  await assertFails(alice.doc('users/alice').update({ subscription: 'pro' }));
  await assertFails(alice.doc('users/alice').update({ credits: { current: 999, total: 999 } }));
  await assertFails(alice.doc('users/alice').update({ stripeCustomerId: 'cus_123' }));
  await assertFails(alice.doc('users/alice').update({ stripeSubscriptionId: 'sub_123' }));

  // 3) Nested data: only owner/admin can access
  await assertSucceeds(alice.collection('users/alice/projects').add({ name: 'P1' }));
  await assertFails(alice.collection('users/bob/projects').add({ name: 'NOPE' }));

  // Create a project under Alice to test deeper nesting
  const projectPath = 'users/alice/projects/proj1';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await adminDb.doc(projectPath).set({ name: 'Project 1' });
  });

  await assertSucceeds(alice.doc(projectPath).get());
  await assertFails(bob.doc(projectPath).get());
  await assertSucceeds(admin.doc(projectPath).get());

  // 4) Admin can update privileged fields
  await assertSucceeds(admin.doc('users/bob').update({ role: 'admin' }));
  await assertSucceeds(admin.doc('users/bob').update({ isAdmin: true }));
  await assertSucceeds(admin.doc('users/bob').update({ subscription: 'pro' }));
  await assertSucceeds(admin.doc('users/bob').update({ stripeCustomerId: 'cus_123' }));

  // Cleanup
  await testEnv.cleanup();
  // eslint-disable-next-line no-console
  console.log('✅ Firestore rules tests passed');
}

await main();


