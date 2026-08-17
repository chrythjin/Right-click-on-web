'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STATES,
  resolveToolbarActionState,
  applyToolbarActionState
} = require('../../toolbar-action-utils.js');

test('effective disabled settings map to OFF and a full Korean title', () => {
  assert.strictEqual(resolveToolbarActionState({
    enabled: false,
    mode: 'ultimate',
    sessionActive: false
  }), STATES.OFF);
  assert.deepEqual(STATES.OFF, {
    badgeText: 'OFF',
    title: 'Right-click on Web: 현재 사이트에서 꺼짐'
  });
});

test('effective Lite and Ultimate modes map to L and U', () => {
  assert.deepEqual(resolveToolbarActionState({
    enabled: true,
    mode: 'lite',
    sessionActive: false
  }), {
    badgeText: 'L',
    title: 'Right-click on Web: 현재 사이트 Lite 모드'
  });
  assert.deepEqual(resolveToolbarActionState({
    enabled: true,
    mode: 'ultimate',
    sessionActive: false
  }), {
    badgeText: 'U',
    title: 'Right-click on Web: 현재 사이트 Ultimate 모드'
  });
});

test('session override has precedence over disabled global or domain state', () => {
  assert.deepEqual(resolveToolbarActionState({
    enabled: false,
    mode: 'lite',
    sessionActive: true
  }), {
    badgeText: 'S',
    title: 'Right-click on Web: 현재 사이트 세션 임시 활성화'
  });
});

test('action methods receive tab-scoped badge and title updates', async () => {
  const calls = [];
  const action = {
    async setBadgeText(details) {
      calls.push(['badge', details]);
    },
    async setTitle(details) {
      calls.push(['title', details]);
    }
  };

  assert.equal(await applyToolbarActionState(action, 42, STATES.LITE), true);
  assert.deepEqual(calls, [
    ['badge', { tabId: 42, text: 'L' }],
    ['title', { tabId: 42, title: 'Right-click on Web: 현재 사이트 Lite 모드' }]
  ]);
});

test('missing and throwing action APIs are isolated as best-effort failures', async () => {
  let titleCalled = false;
  const throwingAction = {
    setBadgeText() {
      throw new Error('badge unavailable');
    },
    async setTitle() {
      titleCalled = true;
      throw new Error('title unavailable');
    }
  };

  await assert.doesNotReject(() => applyToolbarActionState(undefined, 7, STATES.OFF));
  await assert.doesNotReject(() => applyToolbarActionState(throwingAction, 7, STATES.OFF));
  assert.equal(await applyToolbarActionState(undefined, 7, STATES.OFF), false);
  assert.equal(titleCalled, true);
});
