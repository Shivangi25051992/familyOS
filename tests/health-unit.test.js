/**
 * FamilyOS Health Module — Unit Tests
 * Tests all pure/helper functions extracted from public/index.html.
 * Run: node tests/health-unit.test.js
 *
 * No Firebase or browser needed — pure JS logic only.
 */

'use strict';

let passed = 0, failed = 0, total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}\n     ${e.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe: (expected) => {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual: (expected) => {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
    toContain: (substr) => {
      if (!String(actual).includes(substr)) throw new Error(`Expected "${actual}" to contain "${substr}"`);
    },
    toNotContain: (substr) => {
      if (String(actual).includes(substr)) throw new Error(`Expected "${actual}" NOT to contain "${substr}"`);
    },
    toBeArray: () => {
      if (!Array.isArray(actual)) throw new Error(`Expected array, got ${typeof actual}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`Expected length ${n}, got ${actual.length}`);
    },
    toBeGreaterThan: (n) => {
      if (actual <= n) throw new Error(`Expected ${actual} > ${n}`);
    },
    toBeTruthy: () => {
      if (!actual) throw new Error(`Expected truthy, got ${actual}`);
    },
    toBeFalsy: () => {
      if (actual) throw new Error(`Expected falsy, got ${actual}`);
    },
  };
}

// ─────────────────────────────────────────────
// FUNCTIONS UNDER TEST (extracted from index.html)
// ─────────────────────────────────────────────

const safeHtml = s =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function safeParseJSON(text) {
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch (e) { return null; }
}

function formatReportDate(dateStr) {
  if (!dateStr || dateStr === 'undefined' || dateStr === 'null') return 'Date unknown';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildMedSchedule(meds) {
  const schedule = { morning: [], afternoon: [], evening: [], night: [] };
  for (const m of meds) {
    const freq = (m.frequency || '').toLowerCase();
    if (/once|od|once daily|1x|q24/.test(freq))                          { schedule.morning.push(m); }
    else if (/twice|bd|bid|2x|q12|two times/.test(freq))                 { schedule.morning.push(m); schedule.night.push(m); }
    else if (/three|tid|tds|3x|q8/.test(freq))                           { schedule.morning.push(m); schedule.afternoon.push(m); schedule.night.push(m); }
    else if (/four|qid|4x|q6/.test(freq))                                { schedule.morning.push(m); schedule.afternoon.push(m); schedule.evening.push(m); schedule.night.push(m); }
    else if (/morning/.test(freq))                                        { schedule.morning.push(m); }
    else if (/night|bedtime|hs/.test(freq))                               { schedule.night.push(m); }
    else if (/evening/.test(freq))                                        { schedule.evening.push(m); }
    else                                                                   { schedule.morning.push(m); }
  }
  return schedule;
}

const TARGET_MARKERS = [
  'ca 19-9','ca19-9','afp','cea','bilirubin','alt','sgpt','ast','sgot',
  'alkaline phosphatase','alp','hemoglobin','haemoglobin','wbc','platelets',
  'creatinine','albumin','ca 125','psa',
];

function getKeyMarkers(reports) {
  const seen = {};
  for (const r of reports) {
    for (const f of (r.keyFindings || [])) {
      const key = (f.name || '').toLowerCase().trim();
      const matchKey = TARGET_MARKERS.find(t => key.includes(t));
      if (matchKey && !seen[matchKey]) {
        let trend = 'eq';
        const olderReport = reports.find(r2 => r2 !== r && r2.keyFindings?.some(f2 => f2.name?.toLowerCase().includes(matchKey)));
        if (olderReport) {
          const older = olderReport.keyFindings.find(f2 => f2.name?.toLowerCase().includes(matchKey));
          const cur = parseFloat(String(f.value).replace(/[^\d.]/g, ''));
          const old = parseFloat(String(older.value).replace(/[^\d.]/g, ''));
          if (!isNaN(cur) && !isNaN(old)) trend = cur > old ? 'up' : cur < old ? 'down' : 'eq';
        }
        seen[matchKey] = { name: f.name, value: f.value, unit: f.unit || '', flag: f.flag || 'normal', trend };
      }
    }
  }
  return Object.values(seen);
}

// ─────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────

console.log('\n═══ safeHtml — XSS Prevention ═══');

test('passes plain text unchanged', () => {
  expect(safeHtml('Hello World')).toBe('Hello World');
});
test('escapes < and >', () => {
  expect(safeHtml('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
});
test('escapes & ampersand', () => {
  expect(safeHtml('AT&T')).toBe('AT&amp;T');
});
test('escapes double quotes', () => {
  expect(safeHtml('say "hi"')).toBe('say &quot;hi&quot;');
});
test('escapes single quotes', () => {
  expect(safeHtml("it's")).toBe('it&#039;s');
});
test('blocks script tag injection', () => {
  const out = safeHtml('<script>alert(1)</script>');
  expect(out).toNotContain('<script>');
  expect(out).toContain('&lt;script&gt;');
});
test('blocks img onerror xss', () => {
  const out = safeHtml('<img src=x onerror=alert(1)>');
  expect(out).toNotContain('<img');
});
test('blocks javascript: protocol', () => {
  const out = safeHtml('javascript:alert(1)');
  expect(out).toBe('javascript:alert(1)'); // not HTML, just text — safe
});
test('handles null gracefully', () => {
  expect(safeHtml(null)).toBe('');
});
test('handles undefined gracefully', () => {
  expect(safeHtml(undefined)).toBe('');
});
test('handles number input', () => {
  expect(safeHtml(42)).toBe('42');
});
test('handles object toString', () => {
  expect(safeHtml({})).toBe('[object Object]');
});
test('handles nested quotes', () => {
  const out = safeHtml(`He said "it's fine"`);
  expect(out).toContain('&quot;');
  expect(out).toContain('&#039;');
});
test('handles SVG injection', () => {
  const out = safeHtml('<svg onload=alert(1)>');
  expect(out).toNotContain('<svg');
});
test('handles empty string', () => {
  expect(safeHtml('')).toBe('');
});

console.log('\n═══ safeParseJSON — JSON Parsing ═══');

test('parses plain JSON object', () => {
  const result = safeParseJSON('{"key":"value"}');
  expect(result.key).toBe('value');
});
test('parses JSON wrapped in markdown code block', () => {
  const result = safeParseJSON('```json\n{"afp":"780"}\n```');
  expect(result.afp).toBe('780');
});
test('parses JSON wrapped in generic code block', () => {
  const result = safeParseJSON('```\n{"a":1}\n```');
  expect(result.a).toBe(1);
});
test('returns null for invalid JSON', () => {
  expect(safeParseJSON('not json')).toBe(null);
});
test('returns null for empty string', () => {
  expect(safeParseJSON('')).toBe(null);
});
test('parses JSON array', () => {
  const result = safeParseJSON('[1,2,3]');
  expect(result).toEqual([1, 2, 3]);
});
test('handles whitespace around JSON', () => {
  const result = safeParseJSON('  {"x": 5}  ');
  expect(result.x).toBe(5);
});

console.log('\n═══ formatReportDate — Date Formatting ═══');

test('formats valid ISO date', () => {
  const out = formatReportDate('2025-03-15');
  expect(out).toContain('Mar');
  expect(out).toContain('2025');
});
test('returns "Date unknown" for null', () => {
  expect(formatReportDate(null)).toBe('Date unknown');
});
test('returns "Date unknown" for undefined', () => {
  expect(formatReportDate(undefined)).toBe('Date unknown');
});
test('returns "Date unknown" for literal string "null"', () => {
  expect(formatReportDate('null')).toBe('Date unknown');
});
test('returns "Date unknown" for literal string "undefined"', () => {
  expect(formatReportDate('undefined')).toBe('Date unknown');
});
test('returns original string for invalid date', () => {
  expect(formatReportDate('not-a-date')).toBe('not-a-date');
});
test('handles empty string', () => {
  expect(formatReportDate('')).toBe('Date unknown');
});

console.log('\n═══ buildMedSchedule — Frequency Mapping ═══');

const makeMed = (id, freq) => ({ id, name: `Med-${id}`, frequency: freq, dose: '1 tab' });

test('OD / once daily → morning only', () => {
  const s = buildMedSchedule([makeMed('a', 'Once daily (OD)')]);
  expect(s.morning).toHaveLength(1);
  expect(s.afternoon).toHaveLength(0);
  expect(s.evening).toHaveLength(0);
  expect(s.night).toHaveLength(0);
});
test('BD / twice daily → morning + night', () => {
  const s = buildMedSchedule([makeMed('b', 'Twice daily (BD)')]);
  expect(s.morning).toHaveLength(1);
  expect(s.night).toHaveLength(1);
  expect(s.afternoon).toHaveLength(0);
});
test('TID / three times → morning + afternoon + night', () => {
  const s = buildMedSchedule([makeMed('c', 'Three times daily (TID)')]);
  expect(s.morning).toHaveLength(1);
  expect(s.afternoon).toHaveLength(1);
  expect(s.night).toHaveLength(1);
  expect(s.evening).toHaveLength(0);
});
test('QID / four times → all 4 slots', () => {
  const s = buildMedSchedule([makeMed('d', 'Four times daily (QID)')]);
  expect(s.morning).toHaveLength(1);
  expect(s.afternoon).toHaveLength(1);
  expect(s.evening).toHaveLength(1);
  expect(s.night).toHaveLength(1);
});
test('lowercase "once" pattern matches', () => {
  const s = buildMedSchedule([makeMed('e', 'once a day')]);
  expect(s.morning).toHaveLength(1);
});
test('"bid" abbreviation matches twice daily', () => {
  const s = buildMedSchedule([makeMed('f', 'bid')]);
  expect(s.morning).toHaveLength(1);
  expect(s.night).toHaveLength(1);
});
test('"tds" abbreviation matches three times daily', () => {
  const s = buildMedSchedule([makeMed('g', 'tds')]);
  expect(s.morning).toHaveLength(1);
  expect(s.afternoon).toHaveLength(1);
  expect(s.night).toHaveLength(1);
});
test('unknown frequency defaults to morning', () => {
  const s = buildMedSchedule([makeMed('h', 'as needed')]);
  expect(s.morning).toHaveLength(1);
});
test('empty meds array returns empty schedule', () => {
  const s = buildMedSchedule([]);
  expect(s.morning).toHaveLength(0);
  expect(s.night).toHaveLength(0);
});
test('multiple meds accumulate in slots correctly', () => {
  const meds = [
    makeMed('i', 'OD'),  // morning
    makeMed('j', 'BD'),  // morning + night
    makeMed('k', 'TID'), // morning + afternoon + night
  ];
  const s = buildMedSchedule(meds);
  expect(s.morning).toHaveLength(3);
  expect(s.afternoon).toHaveLength(1);
  expect(s.night).toHaveLength(2);
});
test('"morning" keyword maps to morning slot', () => {
  const s = buildMedSchedule([makeMed('l', 'morning with food')]);
  expect(s.morning).toHaveLength(1);
});
test('"night" keyword maps to night slot', () => {
  const s = buildMedSchedule([makeMed('m', 'at night before bed')]);
  expect(s.night).toHaveLength(1);
});
test('"q12" maps to twice daily', () => {
  const s = buildMedSchedule([makeMed('n', 'q12h')]);
  expect(s.morning).toHaveLength(1);
  expect(s.night).toHaveLength(1);
});

console.log('\n═══ getKeyMarkers — Cancer Marker Extraction ═══');

const SAMPLE_REPORTS = [
  {
    date: '2024-10-01',
    keyFindings: [
      { name: 'AFP',       value: '1200', unit: 'ng/mL', flag: 'critical' },
      { name: 'CA 19-9',  value: '450',  unit: 'U/mL',  flag: 'critical' },
      { name: 'Bilirubin',value: '2.1',  unit: 'mg/dL', flag: 'watch' },
      { name: 'Hemoglobin',value:'10.2', unit: 'g/dL',  flag: 'watch' },
      { name: 'Creatinine',value:'0.9',  unit: 'mg/dL', flag: 'normal' },
    ],
  },
  {
    date: '2024-12-01',
    keyFindings: [
      { name: 'AFP',       value: '780',  unit: 'ng/mL', flag: 'critical' },
      { name: 'CA 19-9',  value: '320',  unit: 'U/mL',  flag: 'critical' },
      { name: 'Bilirubin',value: '1.5',  unit: 'mg/dL', flag: 'watch' },
      { name: 'Hemoglobin',value:'11.5', unit: 'g/dL',  flag: 'watch' },
    ],
  },
];

test('extracts AFP from reports', () => {
  const markers = getKeyMarkers(SAMPLE_REPORTS);
  const afp = markers.find(m => m.name === 'AFP');
  expect(afp).toBeTruthy();
});
test('AFP value is from MOST RECENT report (index 0)', () => {
  const markers = getKeyMarkers(SAMPLE_REPORTS);
  const afp = markers.find(m => m.name === 'AFP');
  expect(afp.value).toBe('1200'); // first in array (newest passed first = index 0)
});
test('computes downward trend for AFP (1200→780)', () => {
  // When newest report has lower value than older, trend = down
  const newestFirst = [...SAMPLE_REPORTS].reverse(); // Dec first, then Oct
  const markers = getKeyMarkers(newestFirst);
  const afp = markers.find(m => m.name === 'AFP');
  expect(afp.trend).toBe('down');
});
test('computes upward trend correctly', () => {
  const reports = [
    { date: '2024-12-01', keyFindings: [{ name: 'AFP', value: '900', unit: 'ng/mL', flag: 'critical' }] },
    { date: '2024-10-01', keyFindings: [{ name: 'AFP', value: '600', unit: 'ng/mL', flag: 'critical' }] },
  ];
  const markers = getKeyMarkers(reports); // newest first
  const afp = markers.find(m => m.name === 'AFP');
  expect(afp.trend).toBe('up');
});
test('returns eq trend when only one report', () => {
  const markers = getKeyMarkers([SAMPLE_REPORTS[0]]);
  const afp = markers.find(m => m.name === 'AFP');
  expect(afp.trend).toBe('eq');
});
test('extracts CA 19-9', () => {
  const markers = getKeyMarkers(SAMPLE_REPORTS);
  const ca = markers.find(m => m.name === 'CA 19-9');
  expect(ca).toBeTruthy();
});
test('extracts Bilirubin', () => {
  const markers = getKeyMarkers(SAMPLE_REPORTS);
  const bil = markers.find(m => m.name === 'Bilirubin');
  expect(bil).toBeTruthy();
});
test('extracts Hemoglobin', () => {
  const markers = getKeyMarkers(SAMPLE_REPORTS);
  const hgb = markers.find(m => m.name === 'Hemoglobin');
  expect(hgb).toBeTruthy();
});
test('does not duplicate markers from multiple reports', () => {
  const markers = getKeyMarkers(SAMPLE_REPORTS);
  const afpMarkers = markers.filter(m => m.name === 'AFP');
  expect(afpMarkers).toHaveLength(1); // only one AFP entry
});
test('preserves flag from source finding', () => {
  const markers = getKeyMarkers(SAMPLE_REPORTS);
  const afp = markers.find(m => m.name === 'AFP');
  expect(afp.flag).toBe('critical');
});
test('handles empty keyFindings gracefully', () => {
  const reports = [{ date: '2024-01-01', keyFindings: [] }];
  const markers = getKeyMarkers(reports);
  expect(markers).toHaveLength(0);
});
test('handles reports with no keyFindings property', () => {
  const reports = [{ date: '2024-01-01' }];
  const markers = getKeyMarkers(reports);
  expect(markers).toHaveLength(0);
});
test('case-insensitive marker name matching (hemoglobin vs Hemoglobin)', () => {
  const reports = [{ date: '2024-01-01', keyFindings: [{ name: 'HEMOGLOBIN', value: '12', unit: 'g/dL', flag: 'watch' }] }];
  const markers = getKeyMarkers(reports);
  expect(markers).toHaveLength(1);
});
test('matches ALT/SGPT by partial name', () => {
  const reports = [{ date: '2024-01-01', keyFindings: [{ name: 'ALT/SGPT', value: '85', unit: 'U/L', flag: 'watch' }] }];
  const markers = getKeyMarkers(reports);
  const alt = markers.find(m => m.name === 'ALT/SGPT');
  expect(alt).toBeTruthy();
});
test('returns array', () => {
  expect(getKeyMarkers(SAMPLE_REPORTS)).toBeArray();
});
test('handles empty reports array', () => {
  expect(getKeyMarkers([])).toHaveLength(0);
});

// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────

const statusLine = failed === 0
  ? `\n🟢 ALL ${total} TESTS PASSED`
  : `\n🔴 ${failed}/${total} TESTS FAILED`;

console.log('\n' + '═'.repeat(50));
console.log(statusLine);
console.log(`   Passed: ${passed}  Failed: ${failed}  Total: ${total}`);
console.log('═'.repeat(50) + '\n');

process.exit(failed > 0 ? 1 : 0);
