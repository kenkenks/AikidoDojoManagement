'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'gas', '08_MemberCard.js'), 'utf8');

function load(overrides) {
  const writes = [];
  const sandbox = Object.assign({
    Job: class Job {},
    daoMemberCardBegin_: headers => ({
      readMembers() {
        throw new Error('legacy MemberCard readMembers must not be used for Member reads');
      },
      writeRows(rows) {
        writes.push({ headers, rows });
      }
    }),
    daoMemberGetAll_: () => [],
    ScriptApp: {
      getService() {
        return { getUrl: () => 'https://example.test/exec' };
      }
    },
    Browser: { msgBox() {} },
    daoMemberCardCreateTemplate_: () => {},
    daoMemberCardReadMemberValues_: () => [[]]
  }, overrides || {});
  sandbox.__writes = writes;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: '08_MemberCard.js' });
  return sandbox;
}

test('MemberCard generation consumes logical Member DTO fields', () => {
  let calls = 0;
  let message = '';
  const sandbox = load({
    daoMemberGetAll_: () => {
      calls += 1;
      return [
        { member_id: 'M1', member_name: '会員一', status: '有効' },
        { member_id: 'M2', member_name: '退会会員', status: '退会' }
      ];
    },
    Browser: { msgBox(value) { message = value; } }
  });

  sandbox.generateMemberCards();

  assert.equal(calls, 1);
  assert.equal(sandbox.__writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.__writes[0])), {
    headers: ['member_id', '氏名', 'URL', 'QR'],
    rows: [[
      'M1',
      '会員一',
      'https://example.test/exec?member_id=M1',
      '=IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" & ENCODEURL(C2))'
    ]]
  });
  assert.equal(message, '1件の会員カードを作成しました。');
});

test('payment lookup keeps existing physical table header contract', () => {
  const sandbox = load({
    daoMemberCardReadMemberValues_: () => [
      ['member_id', '氏名'],
      ['M1', '会員一']
    ]
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.getMemberInfoForPayment('M1'))),
    { success: true, memberId: 'M1', memberName: '会員一' }
  );
});
