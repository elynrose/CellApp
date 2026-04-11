/**
 * Load integration API keys from Firestore (never sent to client).
 * Shared by HTTP /api/cell-tools and scheduled cell execution.
 */

async function getIntegrationSecretsForUser(firestore, userId) {
  try {
    if (!firestore || !userId) return {};
    const userDoc = await firestore.collection('users').doc(userId).get();
    if (!userDoc.exists) return {};
    const data = userDoc.data() || {};
    return data.integrationSecrets && typeof data.integrationSecrets === 'object'
      ? data.integrationSecrets
      : {};
  } catch (e) {
    console.error('getIntegrationSecretsForUser:', e.message);
    return {};
  }
}

module.exports = { getIntegrationSecretsForUser };
