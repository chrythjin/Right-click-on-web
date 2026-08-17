'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyOcrCaptureFailure } = require('../../ocr-session-utils.js');

test('classifyOcrCaptureFailure: 시크릿 모드 + 허용 안 됨 → 시크릿 안내 메시지', () => {
  const result = classifyOcrCaptureFailure('Taking screenshots has been disabled', {
    incognito: true,
    incognitoAllowed: false
  });
  assert.ok(result.includes('시크릿 모드'));
  assert.ok(result.includes('chrome://extensions'));
});

test('classifyOcrCaptureFailure: 시크릿 아님 + 캡처 비활성화 → 정책/보안 프로그램 안내', () => {
  const result = classifyOcrCaptureFailure('Taking screenshots has been disabled', {
    incognito: false,
    incognitoAllowed: true
  });
  assert.ok(result.includes('화면 캡처가 비활성화'));
  assert.ok(!result.includes('시크릿 모드'));
});

test('classifyOcrCaptureFailure: 시크릿 모드라도 허용됨 → 일반 캡처 차단 안내', () => {
  const result = classifyOcrCaptureFailure('Taking screenshots has been disabled', {
    incognito: true,
    incognitoAllowed: true
  });
  assert.ok(result.includes('화면 캡처가 비활성화'));
  assert.ok(!result.includes('시크릿 모드'));
});

test('classifyOcrCaptureFailure: "cannot access chrome://" → 보호된 페이지 안내', () => {
  const result = classifyOcrCaptureFailure('Cannot access contents of url "chrome://extensions/"');
  assert.ok(result.includes('브라우저 내부 페이지'));
});

test('classifyOcrCaptureFailure: 웹 스토어 접근 거부 → 보호된 페이지 안내', () => {
  const result = classifyOcrCaptureFailure('Cannot access a chrome URL or the Web Store');
  assert.ok(result.includes('브라우저 내부 페이지'));
});

test('classifyOcrCaptureFailure: 권한 부족 → 권한 안내', () => {
  const result = classifyOcrCaptureFailure('The <all_urls> permission is required');
  assert.ok(result.includes('권한'));
});

test('classifyOcrCaptureFailure: 알 수 없는 오류 → 원문 보존', () => {
  const result = classifyOcrCaptureFailure('Tesseract worker exploded');
  assert.equal(result, 'Tesseract worker exploded');
});

test('classifyOcrCaptureFailure: 빈 메시지 → 기본 메시지', () => {
  const result = classifyOcrCaptureFailure('', {});
  assert.equal(result, 'OCR 화면 캡처에 실패했습니다.');
});

test('classifyOcrCaptureFailure: 비문자열 메시지 → 기본 메시지', () => {
  const result = classifyOcrCaptureFailure(undefined, {});
  assert.equal(result, 'OCR 화면 캡처에 실패했습니다.');
});

test('classifyOcrCaptureFailure: 컨텍스트 미제공 시 크래시 없이 일반 캡처 차단 안내', () => {
  const result = classifyOcrCaptureFailure('Taking screenshots has been disabled');
  assert.ok(result.includes('화면 캡처가 비활성화'));
});