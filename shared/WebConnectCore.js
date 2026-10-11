// WebConnect API contract shared by GAS and Cloud Run. No runtime-specific APIs.
var WebConnectCore = (function () {
  function route(request) {
    var method = String(request && request.method || 'GET').toUpperCase();
    var action = String(request && request.action || '');
    if (method === 'GET' && action === 'time_travel_admin') {
      return { operation: 'timeTravel.read', input: null };
    }
    if (method === 'POST' && action === 'time_travel_set') {
      var data = request.data || {};
      return { operation: 'timeTravel.save', input: {
        enabled: data.enabled,
        now: data.now || '',
        target_month: data.target_month || ''
      } };
    }
    return null;
  }
  return { route: route };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WebConnectCore;
