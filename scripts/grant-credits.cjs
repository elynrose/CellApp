/**
 * Grant credits to a Firestore user (Admin SDK). Loads .env from repo root.
 *
 * Usage: node scripts/grant-credits.cjs <uid> [amount]
 * Default amount: 500 (adds to credits.current and credits.total).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const admin = require('firebase-admin');
const { initializeFirebase } = require('../server/firebase-server-config');

async function main() {
  const uid = process.argv[2]?.trim();
  const amount = parseInt(process.argv[3] || '500', 10);
  if (!uid) {
    console.error('Usage: node scripts/grant-credits.cjs <uid> [amount]');
    process.exit(1);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error('Amount must be a positive number');
    process.exit(1);
  }

  const firestore = await initializeFirebase();
  if (!firestore) {
    console.error(
      'Firestore Admin not initialized.\n' +
        '  Set FIREBASE_SERVICE_ACCOUNT_KEY (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (path to .json),\n' +
        '  or place a service account key file where server/firebase-server-config.js expects it.'
    );
    process.exit(1);
  }

  const ref = firestore.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error('No users/' + uid + ' document. Create the user profile first or check the UID.');
    process.exit(1);
  }

  const d = snap.data();
  const cur = d.credits?.current ?? 0;
  const tot = d.credits?.total ?? 0;
  const newCurrent = cur + amount;
  const newTotal = tot + amount;

  await ref.update({
    'credits.current': newCurrent,
    'credits.total': newTotal,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`Added ${amount} credits to ${uid}`);
  console.log(`  credits.current: ${cur} → ${newCurrent}`);
  console.log(`  credits.total:   ${tot} → ${newTotal}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
