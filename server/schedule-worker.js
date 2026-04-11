/**
 * Polls Firestore schedule jobs and bumps cells to trigger client-side execution.
 * Run alongside the main server or as a separate process (ENABLE_SCHEDULE_WORKER=true).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const admin = require('firebase-admin');
const cronParser = require('cron-parser');
const { runScheduledCellExecution } = require('./scheduled-cell-run');

let db = null;

async function initFirestore() {
  if (db) return db;
  if (admin.apps.length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || 'cellulai'
      });
    } else {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'cellulai'
      });
    }
  }
  db = admin.firestore();
  return db;
}

function nextFireIso(cronExpression, timeZone) {
  try {
    const it = cronParser.parseExpression(cronExpression, {
      currentDate: new Date(),
      tz: timeZone || 'UTC'
    });
    return it.next().toDate().toISOString();
  } catch (e) {
    console.error('cron parse error', cronExpression, e.message);
    return new Date(Date.now() + 60 * 1000).toISOString();
  }
}

async function processDueJobs(firestore) {
  const nowMs = Date.now();
  const snap = await firestore.collectionGroup('scheduleJobs').where('enabled', '==', true).limit(50).get();

  if (snap.empty) return 0;

  let n = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const nr = data.nextRunAt;
    let due = false;
    if (nr && typeof nr.toMillis === 'function') {
      due = nr.toMillis() <= nowMs;
    } else if (nr && nr.seconds) {
      due = nr.seconds * 1000 <= nowMs;
    } else {
      due = true;
    }
    if (!due) continue;

    const userId = data.userId;
    const projectId = data.projectId;
    const sheetId = data.sheetId;
    const cellId = data.cellId;
    const cronExpression = data.cronExpression;
    const timeZone = data.timeZone || 'UTC';

    if (!userId || !projectId || !sheetId || !cellId || !cronExpression) {
      await docSnap.ref.update({ enabled: false, lastError: 'Invalid job fields' });
      continue;
    }

    const cellRef = firestore.doc(
      `users/${userId}/projects/${projectId}/sheets/${sheetId}/cells/${cellId}`
    );

    try {
      const runOnServer = process.env.SCHEDULE_RUN_ON_SERVER === 'true';

      if (runOnServer) {
        await runScheduledCellExecution(firestore, { userId, projectId, sheetId, cellId });
        const nextIso = nextFireIso(cronExpression, timeZone);
        await docSnap.ref.update({
          nextRunAt: admin.firestore.Timestamp.fromDate(new Date(nextIso)),
          lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
          lastServerRunOk: true,
          lastError: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await firestore.runTransaction(async (tx) => {
          const cellDoc = await tx.get(cellRef);
          if (!cellDoc.exists) {
            throw new Error('Cell not found');
          }
          const c = cellDoc.data();
          if (!c.autoRun) {
            throw new Error('autoRun disabled');
          }
          const trig = (c.scheduledRunTrigger || 0) + 1;
          tx.update(cellRef, {
            scheduledRunTrigger: trig,
            scheduledRunAt: admin.firestore.FieldValue.serverTimestamp()
          });
          const nextIso = nextFireIso(cronExpression, timeZone);
          tx.update(docSnap.ref, {
            nextRunAt: admin.firestore.Timestamp.fromDate(new Date(nextIso)),
            lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
      }
      n += 1;
    } catch (e) {
      console.error('schedule job failed', docSnap.id, e.message);
      try {
        const nextIso = nextFireIso(cronExpression, timeZone);
        await docSnap.ref.update({
          lastError: e.message,
          nextRunAt: admin.firestore.Timestamp.fromDate(new Date(nextIso)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (e2) {
        await docSnap.ref.update({
          lastError: e.message,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  }
  return n;
}

async function tick() {
  try {
    const firestore = await initFirestore();
    const processed = await processDueJobs(firestore);
    if (processed > 0) {
      console.log(`⏰ Schedule worker: processed ${processed} job(s)`);
    }
  } catch (e) {
    console.error('Schedule worker tick error:', e.message);
  }
}

function startScheduleWorker(intervalMs = 15000) {
  if (process.env.ENABLE_SCHEDULE_WORKER !== 'true') {
    console.log('⚠️ Schedule worker disabled (set ENABLE_SCHEDULE_WORKER=true to enable)');
    return;
  }
  console.log(`✅ Schedule worker starting (every ${intervalMs}ms)`);
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { startScheduleWorker, tick };
