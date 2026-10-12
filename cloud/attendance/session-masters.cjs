'use strict';
// Read-only, bounded master lookup for SessionInfo. No HTTP or authorization policy here.
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
    const location = await masterDao.readById(SOURCES.dojo, locationId);
    if (!location || location.location_id !== locationId) return {location: null, billingBlocks: [], trainingSlots: []};
    const filter = [{field: 'location_id', value: locationId}];
    const [billingBlocks, trainingSlots] = await Promise.all([
      masterDao.queryEqual(SOURCES.billingBlock, filter),
      masterDao.queryEqual(SOURCES.trainingSlot, filter)
    ]);
    if (!Array.isArray(billingBlocks) || !Array.isArray(trainingSlots)) throw new Error('INVALID_SESSION_MASTERS');
    return {location, billingBlocks, trainingSlots};
  };
}
module.exports = {createSessionMasterReader};
