'use strict';
// 同じ手順を同期DAO（GAS）と非同期DAO（Node）の両方で実行する。
function runSteps(iterator) {
  function advance(method, value) {
    let step = iterator[method](value);
    while (!step.done) {
      if (step.value && typeof step.value.then === 'function') return step.value.then(value => advance('next', value), error => advance('throw', error));
      step = iterator.next(step.value);
    }
    return step.value;
  }
  return advance('next');
}
module.exports = { runSteps };
