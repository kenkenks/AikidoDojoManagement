'use strict';
// Read-only, bounded master lookup for SessionInfo. No HTTP or authorization policy here.
const {restoreFirestoreRecord} = require('../../shared/Schema_Renderer_Firestore.js');
const SCHEMAS = require('../../shared/Attendance_Master_Schemas.generated.json');
const SOURCES = Object.freeze({
  dojo: Object.freeze({collection: 'dojos'}),
  billingBlock: Object.freeze({collection: 'billing_blocks'}),
  trainingSlot: Object.freeze({collection: 'training_slots'})
});
function createSessionMasterReader({masterDao}) {
  if (!masterDao || typeof masterDao.readById !== 'function' ||
      typeof masterDao.queryEqual !== 'function') throw new TypeError('masterDao.readById and queryEqual required');
  return async function readSessionMasters(locationId) {
    if (typeof locationId !== 'string' || !locationId || locationId.trim() !== locationId ||
        locationId === '.' || locationId === '..' || /[\/\\\x00-\x1f]/.test(locationId)) {
      throw new Error('INVALID_LOCATION_ID');
    }
    const locationFields = await masterDao.readById(SOURCES.dojo, locationId);
    if (!locationFields) return {location: null, billingBlocks: [], trainingSlots: []};
    const location = restoreFirestoreRecord(SCHEMAS.Dojo, {id: locationId, fields: locationFields});
    if (location.location_id !== locationId) return {location: null, billingBlocks: [], trainingSlots: []};
    const filter = [{field: 'location_id', value: locationId}];
    const [billingBlocks, trainingSlots] = await Promise.all([
      masterDao.queryEqual(SOURCES.billingBlock, filter),
      masterDao.queryEqual(SOURCES.trainingSlot, filter)
    ]);
    if (!Array.isArray(billingBlocks) || !Array.isArray(trainingSlots)) throw new Error('INVALID_SESSION_MASTERS');
    const restoreRows = (schema, rows) => rows.map(fields => {
      const id = fields?.[schema.documentIdField];
      if (typeof id !== 'string' || !id) throw new Error('SESSION_MASTER_PRIMARY_KEY_REQUIRED');
      return restoreFirestoreRecord(schema, {id, fields});
    });
    return {location, billingBlocks: restoreRows(SCHEMAS.BillingBlock, billingBlocks),
      trainingSlots: restoreRows(SCHEMAS.TrainingSlot, trainingSlots)};
  };
}
module.exports = {createSessionMasterReader};
