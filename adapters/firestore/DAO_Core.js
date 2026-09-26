'use strict';
const {createFirestoreCore}=require('./DAO_Core_Firestore.cjs');
function createCore(config,dependencies={}) { return createFirestoreCore(config,dependencies); }
module.exports={createCore,backend:'firestore'};
