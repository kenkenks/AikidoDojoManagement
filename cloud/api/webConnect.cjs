'use strict';

/**
 * ARCHITECTURE ANCHOR: Transport / Business Domain Boundary
 *
 * Communication is part of the system, but not part of dojo business.
 * HTTP, CORS, authentication token verification and JSON parsing belong to
 * the transport/infrastructure adapter, not to business dispatch.
 *
 * Business UI -> client adapter -> network -> server.cjs -> dispatch
 * Future: dispatch -> WebConnectCore -> Handler -> DAO.
 *
 * Do not introduce doGet/doPost here. Do not add a per-action HTTP endpoint
 * before considering the shared action boundary.
 *
 * This anchor deliberately does not execute business actions. Before enabling
 * dispatch, the server must verify identity and pass trusted actor context;
 * authorization for each action must be enforced at the business boundary.
 * The current WebConnectCore.route still depends on HTTP methods and needs
 * separate refactoring before being treated as transport-neutral.
 */
async function dispatch(_request) {
  return { error: 'WEBCONNECT_NOT_IMPLEMENTED' };
}

module.exports = { dispatch };
