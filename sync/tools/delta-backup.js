'use strict';

/**
 * sync/tools/delta-backup.js
 * 
 * history/file-backups/ 표준 델타 백업(Base + Unified Diff) 생성, 복원 및 마이그레이션 도구.
 * 외부 npm 패키지 없이 순수 Node.js Standard Library로 동작합니다.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// 1. Myers Diff 알고리즘 구현 (Line-by-line)
function myersDiff(aLines, bLines) {
  const n = aLines.length;
  const m = bLines.length;
  const max = n + m;
  const v = { 1: 0 };
  const trace = [];

  for (let d = 0; d <= max; d++) {
    const vCopy = Object.assign({}, v);
    trace.push(vCopy);
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && (v[k - 1] < v[k + 1]))) {
        x = v[k + 1];
      } else {
        x = v[k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && aLines[x] === bLines[y]) {
        x++;
        y++;
      }
      v[k] = x;
      if (x >= n && y >= m) {
        return buildEdits(trace, aLines, bLines, d, k);
      }
    }
  }
  return [];
}

function buildEdits(trace, aLines, bLines, d, k) {
  const edits = [];
  let x = aLines.length;
  let y = bLines.length;

  for (let dIdx = d; dIdx > 0; dIdx--) {
    const v = trace[dIdx];
    const prevK = (k === -dIdx || (k !== dIdx && (v[k - 1] < v[k + 1]))) ? k + 1 : k - 1;
    const prevX = v[prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.unshift({ type: 'keep', line: aLines[x - 1] });
      x--;
      y--;
    }
    if (dIdx > 0) {
      if (x === prevX) {
        edits.unshift({ type: 'add', line: bLines[y - 1] });
        y--;
      } else {
        edits.unshift({ type: 'delete', line: aLines[x - 1] });
        x--;
      }
    }
    k = prevK;
  }
  while (x > 0 && y > 0) {
    edits.unshift({ type: 'keep', line: aLines[x - 1] });
    x--;
    y--;
  }
  return edits;
}

/**
 * edits 항목들을 Unified Diff 형식 Hunk로 묶어 변환
 */
function createUnifiedDiff(oldFileName, newFileName, oldText, newText, contextLines = 3) {
  const aLines = oldText.split(/\r?\n/);
  const bLines = newText.split(/\r?\n/);
  
  // 동일한 파일이면 빈 diff 반환
  if (oldText === newText) {
    return '';
  }

  const edits = myersDiff(aLines, bLines);
  
  // Hunk 생성
  const hunks = [];
  let currentHunk = null;
  
  let oldLineNum = 1;
  let newLineNum = 1;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    
    if (edit.type === 'keep') {
      // 변경 사항 부근의 context line 판단
      const hasUpcomingEdit = edits.slice(i + 1, i + 1 + contextLines).some(e => e.type !== 'keep');
      const hasRecentEdit = currentHunk && currentHunk.lines.some(l => l.type !== 'keep');

      if (hasUpcomingEdit || hasRecentEdit) {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum,
            newStart: newLineNum,
            oldLength: 0,
            newLength: 0,
            lines: []
          };
          hunks.push(currentHunk);
        }
        
        // 최근 edit과의 거리가 멀면 Hunk 닫기
        const trailingKeepsInHunk = [];
        let k = currentHunk.lines.length - 1;
        while (k >= 0 && currentHunk.lines[k].type === 'keep') {
          trailingKeepsInHunk.unshift(currentHunk.lines[k]);
          k--;
        }

        if (!hasUpcomingEdit && trailingKeepsInHunk.length >= contextLines) {
          currentHunk = null;
        } else {
          currentHunk.lines.push({ type: 'keep', text: edit.line });
          currentHunk.oldLength++;
          currentHunk.newLength++;
        }
      } else {
        currentHunk = null;
      }

      oldLineNum++;
      newLineNum++;
    } else if (edit.type === 'delete') {
      if (!currentHunk) {
        // 이전 keep 라인들 중 contextLines 만큼 소급 추가
        const leadingKeeps = [];
        let backIdx = i - 1;
        let contextCount = 0;
        let backOldLine = oldLineNum;
        let backNewLine = newLineNum;
        
        while (backIdx >= 0 && edits[backIdx].type === 'keep' && contextCount < contextLines) {
          leadingKeeps.unshift(edits[backIdx].line);
          backIdx--;
          contextCount++;
          backOldLine--;
          backNewLine--;
        }

        currentHunk = {
          oldStart: backOldLine,
          newStart: backNewLine,
          oldLength: leadingKeeps.length,
          newLength: leadingKeeps.length,
          lines: leadingKeeps.map(l => ({ type: 'keep', text: l }))
        };
        hunks.push(currentHunk);
      }

      currentHunk.lines.push({ type: 'delete', text: edit.line });
      currentHunk.oldLength++;
      oldLineNum++;
    } else if (edit.type === 'add') {
      if (!currentHunk) {
        const leadingKeeps = [];
        let backIdx = i - 1;
        let contextCount = 0;
        let backOldLine = oldLineNum;
        let backNewLine = newLineNum;
        
        while (backIdx >= 0 && edits[backIdx].type === 'keep' && contextCount < contextLines) {
          leadingKeeps.unshift(edits[backIdx].line);
          backIdx--;
          contextCount++;
          backOldLine--;
          backNewLine--;
        }

        currentHunk = {
          oldStart: backOldLine,
          newStart: backNewLine,
          oldLength: leadingKeeps.length,
          newLength: leadingKeeps.length,
          lines: leadingKeeps.map(l => ({ type: 'keep', text: l }))
        };
        hunks.push(currentHunk);
      }

      currentHunk.lines.push({ type: 'add', text: edit.line });
      currentHunk.newLength++;
      newLineNum++;
    }
  }

  if (hunks.length === 0) return '';

  let header = `--- ${oldFileName}\n+++ ${newFileName}\n`;
  let hunkText = hunks.map(h => {
    let hunkHeader = `@@ -${h.oldStart},${h.oldLength} +${h.newStart},${h.newLength} @@\n`;
    let linesText = h.lines.map(l => {
      if (l.type === 'keep') return ` ${l.text}`;
      if (l.type === 'delete') return `-${l.text}`;
      if (l.type === 'add') return `+${l.text}`;
    }).join('\n');
    return hunkHeader + linesText;
  }).join('\n');

  return header + hunkText + '\n';
}

/**
 * Unified Diff 적용하여 원본 복원
 */
function applyUnifiedDiff(baseText, diffText) {
  if (!diffText || !diffText.trim()) return baseText;

  const baseLines = baseText.split(/\r?\n/);
  const diffLines = diffText.split(/\r?\n/);
  
  let resultLines = [];
  let baseIdx = 0;
  let i = 0;

  // Header Skip (---, +++)
  while (i < diffLines.length && (diffLines[i].startsWith('---') || diffLines[i].startsWith('+++'))) {
    i++;
  }

  while (i < diffLines.length) {
    const line = diffLines[i];
    if (!line && i === diffLines.length - 1) break;

    if (line.startsWith('@@')) {
      // Hunk header: @@ -oldStart,oldLen +newStart,newLen @@
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const oldStart = parseInt(match[1], 10);
        // baseIdx를 oldStart - 1 위치로 맞춤
        const targetBaseIdx = Math.max(0, oldStart - 1);
        while (baseIdx < targetBaseIdx && baseIdx < baseLines.length) {
          resultLines.push(baseLines[baseIdx]);
          baseIdx++;
        }
      }
      i++;
      continue;
    }

    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === ' ') {
      resultLines.push(content);
      baseIdx++;
    } else if (prefix === '-') {
      baseIdx++; // base 라인 제거
    } else if (prefix === '+') {
      resultLines.push(content);
    }

    i++;
  }

  // 남아있는 baseLines 뒤쪽 복사
  while (baseIdx < baseLines.length) {
    resultLines.push(baseLines[baseIdx]);
    baseIdx++;
  }

  return resultLines.join('\n');
}

/**
 * history/file-backups/ 내 파일 그룹화 키 추출
 * 파일명 형식: {BaseKey}_{Timestamp}_{OS}_{Username}
 */
function extractGroupKey(filename) {
  // .diff 확장자 제거
  const cleanName = filename.endsWith('.diff') ? filename.slice(0, -5) : filename;
  
  // 날짜/타임스탬프 패턴 _YYYYMMDD_HHMMSS_ 또는 _YYYYMMDD_
  const match = cleanName.match(/^(.*?)(?:_\d{8}_\d{6}|_\d{8})(?:_[a-z0-9_-]+)*$/i);
  if (match && match[1]) {
    return match[1];
  }
  return cleanName;
}

/**
 * 백업 폴더 내 기존 파일들 스캔 및 그룹별 마이그레이션 실행
 */
function migrateBackupDirectory(backupsDir, dryRun = true) {
  if (!fs.existsSync(backupsDir)) {
    console.log(`[Delta Backup] 디렉터리가 존재하지 않습니다: ${backupsDir}`);
    return;
  }

  const files = fs.readdirSync(backupsDir);
  const fileGroups = {};

  for (const file of files) {
    const filePath = path.join(backupsDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const groupKey = extractGroupKey(file);
    if (!fileGroups[groupKey]) {
      fileGroups[groupKey] = [];
    }
    fileGroups[groupKey].push({
      fileName: file,
      filePath: filePath,
      mtimeMs: stat.mtimeMs,
      sizeBytes: stat.size
    });
  }

  let totalOriginalSize = 0;
  let totalReducedSize = 0;
  let convertedCount = 0;

  console.log(`[Delta Backup] 총 ${Object.keys(fileGroups).length}개 백업 그룹 탐색 완료.\n`);

  for (const [groupKey, groupFiles] of Object.entries(fileGroups)) {
    // 생성 시간순 정렬
    groupFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

    if (groupFiles.length <= 1) continue;

    // 첫 번째 파일은 Base로 유지
    const baseFile = groupFiles[0];
    let prevText = fs.readFileSync(baseFile.filePath, 'utf8');

    for (let i = 1; i < groupFiles.length; i++) {
      const target = groupFiles[i];
      if (target.fileName.endsWith('.diff')) {
        // 이미 diff 파일이면 복원 후 prevText 업데이트
        const diffText = fs.readFileSync(target.filePath, 'utf8');
        prevText = applyUnifiedDiff(prevText, diffText);
        continue;
      }

      const currText = fs.readFileSync(target.filePath, 'utf8');
      const diffContent = createUnifiedDiff(path.basename(baseFile.filePath), path.basename(target.filePath), prevText, currText);

      totalOriginalSize += target.sizeBytes;
      const diffSize = Buffer.byteLength(diffContent, 'utf8');
      totalReducedSize += diffSize;
      convertedCount++;

      const newFileName = target.filePath + '.diff';

      if (dryRun) {
        console.log(`[DRY-RUN] ${target.fileName} (${target.sizeBytes} B) -> .diff (${diffSize} B) (절감: ${Math.round((1 - diffSize / target.sizeBytes) * 100)}%)`);
      } else {
        fs.writeFileSync(newFileName, diffContent, 'utf8');
        fs.unlinkSync(target.filePath); // 원본 full 백업 삭제
        console.log(`[MIGRATED] ${target.fileName} -> ${path.basename(newFileName)} (${diffSize} B)`);
      }

      prevText = currText;
    }
  }

  console.log(`\n==============================================`);
  console.log(`[Summary] 변환 대상 파일 수: ${convertedCount}개`);
  console.log(`[Summary] 원본 용량: ${(totalOriginalSize / 1024).toFixed(2)} KB`);
  console.log(`[Summary] 델타 용량: ${(totalReducedSize / 1024).toFixed(2)} KB`);
  const savedKB = ((totalOriginalSize - totalReducedSize) / 1024).toFixed(2);
  console.log(`[Summary] 총 절감 용량: ${savedKB} KB`);
  console.log(`==============================================\n`);
}

// self test / CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const backupsDir = path.resolve(__dirname, '../../history/file-backups');

  if (args.includes('--backup')) {
    runBackupCli(args);
  } else if (args.includes('--test-self') && process.argv.includes('--backup')) {
    runBackupSelfTest(args);
  } else if (args.includes('--dry-run')) {
    console.log(`[Delta Backup] Dry-run 모드로 마이그레이션을 시뮬레이션합니다...`);
    migrateBackupDirectory(backupsDir, true);
  } else if (args.includes('--migrate')) {
    console.log(`[Delta Backup] 기존 백업 파일 마이그레이션을 실행합니다...`);
    migrateBackupDirectory(backupsDir, false);
  } else if (args.includes('--test-self')) {
    // 자가 테스트 실행
    const textA = 'line 1\nline 2\nline 3\n';
    const textB = 'line 1\nline 2 modified\nline 3\nline 4\n';
    const diff = createUnifiedDiff('a.txt', 'b.txt', textA, textB);
    const restored = applyUnifiedDiff(textA, diff);
    console.log('Diff Output:\n' + diff);
    console.log('Self-Test Match:', textB === restored ? 'PASSED' : 'FAILED');
  } else {
    printUsage();
  }
}

/**
 * history/file-backups/{OS}_{USERNAME} 식별자 추정
 * - 우선순위: 환경변수 OPEN_SYNC_OS, OPEN_SYNC_USER → os.userInfo() / process.platform
 */
function resolveHostIdentity() {
  const osTag = process.env.OPEN_SYNC_OS || (process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux');
  let userTag = process.env.OPEN_SYNC_USER || process.env.USERNAME || process.env.USER || 'unknown';
  if (typeof userTag !== 'string' || !userTag) userTag = 'unknown';
  // Hostname/도메인 접두사 정리
  userTag = String(userTag).replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return { osTag, userTag };
}

/**
 * 현재 UTC 시각을 {YYYYMMDD_HHMMSS} 형식으로 직렬화
 */
function formatTimestamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}

/**
 * 절대 또는 상대 경로를 repoRoot 기준의 POSIX 상대경로로 정규화
 */
function toRepoRelativePath(repoRoot, absOrRel) {
  let p = path.isAbsolute(absOrRel) ? absOrRel : path.resolve(process.cwd(), absOrRel);
  const rel = path.relative(repoRoot, p);
  if (rel.startsWith('..')) {
    throw new Error(`파일 경로가 레포 외부에 있습니다: ${absOrRel}`);
  }
  return rel.split(path.sep).join('/');
}

/**
 * git 표준 unified diff 출력 (`git diff --no-color <against> -- <rel>`) 반환
 * - 파일 모드/인덱스 메타 라인은 제거하고 hunk 부터 유지
 * - EOF newline 보장
 */
function createGitUnifiedDiff(repoRoot, targetRel, against = 'HEAD') {
  const safeAgainst = String(against).match(/^[A-Za-z0-9._/\-^~]+$/) ? against : 'HEAD';
  let raw = '';
  let fileTrackedInRef = true;
  try {
    const probe = execFileSync('git', ['cat-file', '-e', `${safeAgainst}:${targetRel}`], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    fileTrackedInRef = probe.status === 0 || probe === undefined;
  } catch (err) {
    if (err.status === 1 || err.status === 128) fileTrackedInRef = false;
    else throw new Error(`git cat-file probe 실패: ${err.stderr || err.message}`);
  }
  try {
    const out = execFileSync('git', ['diff', '--no-color', '--no-ext-diff', '--binary', `${safeAgainst}`, '--', targetRel], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    raw = out;
  } catch (err) {
    if (err.status === 1 && err.stdout) {
      raw = err.stdout;
    } else if (err.status !== 0) {
      if (err.status === 128 && /Unknown revision/.test(err.stderr || '')) {
        fileTrackedInRef = false;
      } else {
        throw new Error(`git diff 실패: ${err.stderr || err.message}`);
      }
    }
  }
  if (!raw && !fileTrackedInRef) {
    const targetAbs = path.resolve(repoRoot, targetRel);
    if (fs.existsSync(targetAbs)) {
      const tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'opencode-delta-empty-'));
      let emptyAbs = '';
      try {
        emptyAbs = path.join(tmpRoot, 'empty');
        fs.writeFileSync(emptyAbs, '', 'utf8');
        const out = execFileSync('git', ['diff', '--no-color', '--no-ext-diff', '--binary', '--no-index', emptyAbs, targetAbs], {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        });
        raw = out
          .replace(/^--- .*$/m, '--- /dev/null')
          .replace(/^\+\+\+ .*$/m, '+++ b/' + targetRel);
      } catch (err) {
        if (err.status === 1 && err.stdout) {
          const head = err.stdout.split(/\r?\n/)[0] || '';
          if (head.includes(emptyAbs) || head.includes(targetAbs)) {
            const reSlug = (absPath) => {
              const esc = absPath.replace(/[\\\/]/g, '\\$&');
              return new RegExp('^--- "?a?/' + esc + '"?\\s*$', 'm');
            };
            const reBPath = (absPath) => {
              const esc = absPath.replace(/[\\\/]/g, '\\$&');
              return new RegExp('^\\+\\+\\+ "?b?/' + esc + '"?\\s*$', 'm');
            };
            raw = err.stdout
              .replace(/^--- .*$/m, '--- /dev/null')
              .replace(/^\+\+\+ .*$/m, '+++ b/' + targetRel);
          } else {
            raw = err.stdout;
          }
        } else {
          throw new Error(`no-index diff 실패: ${err.stderr || err.message}`);
        }
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    }
  }
  if (!raw) return '';
  const filtered = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('diff --git ') || line.startsWith('index ') || line.startsWith('Binary files ')) continue;
    filtered.push(line);
  }
  let out = filtered.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

/**
 * 레포에 추적되지 않는(untracked) 파일의 base는 빈 문자열로 본다.
 * (파일이 새로 추가된 경우의 의미론적 base = "")
 * Windows git의 core.autocrlf 영향으로 base가 CRLF로 정규화될 수 있으므로
 * 호출자가 함께 전달하는 current의 EOL을 우선해 LF로 정규화한다.
 */
function readGitTrackedContent(repoRoot, targetRel, against, current = '') {
  try {
    const raw = execFileSync('git', ['show', `${against}:${targetRel}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return current ? raw.split(/\r?\n/).join('\n') : raw.split(/\r?\n/).join('\n');
  } catch (err) {
    const stderr = err.stderr || '';
    if (err.status === 128 && (/does not exist/.test(stderr) || /exists on disk, but not in/.test(stderr) || /Not a valid object name/.test(stderr))) {
      return '';
    }
    if (err.status === 128 && /Not a valid object name/.test(stderr)) {
      throw new Error(`기준 ref(${against})가 존재하지 않습니다: ${stderr || err.message}`);
    }
    throw err;
  }
}

/**
 * 단일 파일 즉시 base+diff 백업.
 * @param {{repoRoot: string, targetRel: string, against?: string, dryRun?: boolean, force?: boolean, note?: string}} options
 * @returns {Promise<{baseName?: string, diffName?: string, baseBytes?: number, diffBytes?: number, skipped?: 'no-change'|'forced', diffText?: string, baseText?: string}>}
 */
async function backupSingleFile(options) {
  const { repoRoot, targetRel, against = 'HEAD', dryRun = false, force = false, note = '' } = options;
  if (!fs.existsSync(path.join(repoRoot, targetRel))) {
    throw new Error(`파일이 존재하지 않습니다: ${targetRel}`);
  }
  const current = fs.readFileSync(path.join(repoRoot, targetRel), 'utf8').split(/\r?\n/).join('\n');
  const base = readGitTrackedContent(repoRoot, targetRel, against, current);
  const sameContent = base !== '' && base === current;
  if (sameContent && !force) {
    return { skipped: 'no-change' };
  }
  const diffText = await Promise.resolve(createGitUnifiedDiff(repoRoot, targetRel, against));
  // 빈 diff(파일 신규 추가 케이스)는 `git diff`가 생성하지 않으므로 수동으로 작성한다.
  let finalDiff = diffText;
  if (!finalDiff) {
    finalDiff = `--- /dev/null\n+++ b/${targetRel}\n@@ -0,0 +1,${current.split('\n').length - (current.endsWith('\n') ? 1 : 0)} @@\n` +
      current.split(/\r?\n/).slice(0, -1).map((l) => `+${l}`).join('\n') +
      (current.endsWith('\n') ? '\n' : '\n');
  }
  const { osTag, userTag } = resolveHostIdentity();
  const ts = formatTimestamp();
  const relName = targetRel.replace(/[\\/]/g, '_');
  const baseName = `${relName}_${ts}_${osTag}_${userTag}`;
  const diffName = `${baseName}.diff`;
  const backupDir = path.join(repoRoot, 'history', 'file-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const basePath = path.join(backupDir, baseName);
  const diffPath = path.join(backupDir, diffName);

  verifyDiffRoundTrip(repoRoot, targetRel, base, current, finalDiff);

  if (dryRun) {
    console.log(`[dry-run] base: ${baseName} (${Buffer.byteLength(base, 'utf8')} B)`);
    console.log(`[dry-run] diff: ${diffName} (${Buffer.byteLength(finalDiff, 'utf8')} B)`);
    return { baseName, diffName, baseBytes: Buffer.byteLength(base, 'utf8'), diffBytes: Buffer.byteLength(finalDiff, 'utf8'), diffText: finalDiff, baseText: base, dryRun: true };
  }
  if (base !== '') {
    fs.writeFileSync(basePath, base, 'utf8');
  }
  fs.writeFileSync(diffPath, finalDiff, 'utf8');
  console.log(`[backup] base: ${baseName} (${Buffer.byteLength(base, 'utf8')} B)`);
  console.log(`[backup] diff: ${diffName} (${Buffer.byteLength(finalDiff, 'utf8')} B)`);
  appendHistorySummary({ repoRoot, targetRel, baseName, diffName, userNote: note });
  return {
    baseName,
    diffName,
    baseBytes: Buffer.byteLength(base, 'utf8'),
    diffBytes: Buffer.byteLength(finalDiff, 'utf8'),
    diffText: finalDiff,
    baseText: base
  };
}

function verifyDiffRoundTrip(repoRoot, targetRel, base, current, diffText) {
  if (!diffText) return;
  const restored = applyUnifiedDiffUnchecked(base, diffText);
  if (restored !== current) {
    const curBytes = Buffer.byteLength(current, 'utf8');
    const resBytes = Buffer.byteLength(restored, 'utf8');
    const firstDiff = (() => {
      const min = Math.min(current.length, restored.length);
      for (let i = 0; i < min; i++) if (current[i] !== restored[i]) return i;
      return min;
    })();
    throw new Error(
      `round-trip 실패 (current=${curBytes}B, restored=${resBytes}B, first diff @${firstDiff}). ` +
      `context: current=${JSON.stringify(current.slice(Math.max(0, firstDiff - 20), firstDiff + 20))}, ` +
      `restored=${JSON.stringify(restored.slice(Math.max(0, firstDiff - 20), firstDiff + 20))}`
    );
  }
}

function applyUnifiedDiffUnchecked(baseText, diffText) {
  if (!diffText) return baseText;
  const baseLines = baseText.split('\n');
  if (baseLines.length && baseLines[baseLines.length - 1] === '') baseLines.pop();
  const diffLines = diffText.split('\n');
  let i = 0;
  while (i < diffLines.length && (diffLines[i].startsWith('--- ') || diffLines[i].startsWith('+++ '))) i++;
  const result = [];
  let baseCursor = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (!line && i === diffLines.length - 1) break;
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        const oldStart = parseInt(m[1], 10);
        const baseIdx = Math.max(0, oldStart - 1);
        while (baseCursor < baseIdx) { result.push(baseLines[baseCursor]); baseCursor++; }
      }
      i++;
      continue;
    }
    if (line === '\\ No newline at end of file') {
      i++;
      continue;
    }
    const prefix = line[0];
    const content = line.slice(1);
    if (prefix === ' ') {
      result.push(content);
      baseCursor++;
    } else if (prefix === '-') {
      baseCursor++;
    } else if (prefix === '+') {
      result.push(content);
    }
    i++;
  }
  while (baseCursor < baseLines.length) { result.push(baseLines[baseCursor]); baseCursor++; }
  return result.join('\n');
}

function formatTimestampKst(date = new Date()) {
  // 한국 표준시(KST, UTC+9) 기반 일자 표기 (YYYYMMDD)
  const kst = new Date(date.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * history_summary 파일 자동 갱신 (오늘자 파일이 있으면 append, 없으면 생성)
 * 형식 (AGENTS.md 표준):
 *   # Filename - Timestamp
 *   ## User Request
 *   ## Changes Made
 *   ## Previous Value
 *   ## New Value
 */
function appendHistorySummary({ repoRoot, targetRel, baseName, diffName, userNote = '' }) {
  const historyDir = path.join(repoRoot, 'history');
  if (!fs.existsSync(historyDir)) return;
  const { osTag, userTag } = resolveHostIdentity();
  const summaryName = `${formatTimestampKst()}_history_summary_${osTag}_${userTag}.md`;
  const summaryPath = path.join(historyDir, summaryName);
  const now = new Date();
  const userTime = now.toISOString();
  const block =
    `# ${targetRel} - ${userTime}\n` +
    `## User Request\n` +
    (userNote ? userNote + '\n' : '- (직접 호출)\n') +
    `## Changes Made\n` +
    `- history/file-backups/${baseName} (${baseName ? '기준 스냅샷' : '단일 diff'})\n` +
    `- history/file-backups/${diffName} (변경분 unified diff)\n` +
    `## Previous Value\n` +
    `- git HEAD 기준 tracked content 1줄 (자세한 내용은 ${baseName} 참조)\n` +
    `## New Value\n` +
    `- 작업 디렉터리 ${targetRel} 현재 상태\n`;
  fs.appendFileSync(summaryPath, block, 'utf8');
}

function printUsage() {
  const usage = [
    '사용법:',
    '  node sync/tools/delta-backup.js --dry-run',
    '  node sync/tools/delta-backup.js --migrate',
    '  node sync/tools/delta-backup.js --test-self',
    '  node sync/tools/delta-backup.js --backup <repo-relative-path> [--against <ref>] [--dry-run] [--force] [--note "..."]',
    ''
  ].join('\n');
  console.log(usage);
}

async function runBackupSelfTest(args) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'opencode-delta-seltest-'));
  try {
    const targetRel = 'selftest/file.txt';
    const targetAbs = path.join(tmpRoot, targetRel);
    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    fs.writeFileSync(targetAbs, 'line 1\nline 2 to drop\nline 3\n', 'utf8');
    execFileSync('git', ['init', '-q'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.email', 'selftest@example.com'], { cwd: tmpRoot });
    execFileSync('git', ['config', 'user.name', 'selftest'], { cwd: tmpRoot });
    execFileSync('git', ['add', targetRel], { cwd: tmpRoot });
    execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: tmpRoot });
    fs.writeFileSync(targetAbs, 'line 1\nline 3\nline 4\n', 'utf8');
    const result = await backupSingleFile({ repoRoot: tmpRoot, targetRel, against: 'HEAD', note: 'selftest' });
    if (!result.baseName || !result.diffName) throw new Error('selftest: baseName/diffName 누락');
    fs.writeFileSync(path.join(tmpRoot, 'history/file-backups', result.baseName), result.baseText, 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'history/file-backups', result.diffName), result.diffText, 'utf8');
    verifyDiffRoundTrip(tmpRoot, targetRel, result.baseText, fs.readFileSync(targetAbs, 'utf8').split(/\r?\n/).join('\n'), result.diffText);
    fs.rmSync(path.join(tmpRoot, 'history/file-backups', result.baseName), { force: true });
    fs.rmSync(path.join(tmpRoot, 'history/file-backups', result.diffName), { force: true });
    console.log('[selftest] PASS: base+diff round-trip verified');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}


function runBackupCli(args) {
  // --backup 다음의 위치 인자 = targetRel
  const idx = args.indexOf('--backup');
  let targetRel = null;
  if (idx !== -1 && args.length > idx + 1 && !args[idx + 1].startsWith('--')) {
    targetRel = args[idx + 1];
  } else if (idx !== -1) {
    printUsage();
    process.exit(1);
  }
  if (!targetRel) {
    printUsage();
    process.exit(1);
  }
  const againstIdx = args.indexOf('--against');
  const against = againstIdx !== -1 && args[againstIdx + 1] && !args[againstIdx + 1].startsWith('--') ? args[againstIdx + 1] : 'HEAD';
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  let userNote = '';
  const noteIdx = args.indexOf('--note');
  if (noteIdx !== -1) {
    const next = args[noteIdx + 1];
    if (next && !next.startsWith('--')) userNote = next;
    else {
      // --note 다음 플래그가 없고 EOF면 다음 위치 모두를 note로 합치기
      userNote = args.slice(noteIdx + 1).join(' ');
    }
  }
  const repoRoot = path.resolve(__dirname, '..', '..');
  try {
    targetRel = toRepoRelativePath(repoRoot, targetRel);
  } catch (err) {
    console.error(`[backup] ${err.message}`);
    process.exit(2);
  }
  backupSingleFile({ repoRoot, targetRel, against, dryRun, force, note: userNote }).then((result) => {
    if (result.skipped === 'no-change') {
      console.log(`[backup] 변경 없음: ${targetRel} (HEAD와 동일). 강제 백업은 --force 사용`);
      process.exit(0);
    } else {
      process.exit(0);
    }
  }).catch((err) => {
    console.error(`[backup] 오류: ${err.message || err}`);
    process.exit(1);
  });
}

module.exports = {
  myersDiff,
  createUnifiedDiff,
  applyUnifiedDiff,
  extractGroupKey,
  migrateBackupDirectory,
  backupSingleFile,
  createGitUnifiedDiff,
  appendHistorySummary,
  formatTimestamp,
  formatTimestampKst,
  resolveHostIdentity,
  toRepoRelativePath
};
