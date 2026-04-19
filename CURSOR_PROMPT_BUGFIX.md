# Cursor Agent Prompt — FamilyOS Health Module: Bug Fixes + Generic Architecture

Paste this entire file into Cursor Composer (Agent mode). Fix all 4 bugs in order. Ensure zero regression on existing features. After all fixes, run unit tests and deploy.

---

## CONTEXT

File: `public/index.html` (single-file SPA, Vanilla JS + Firebase)
Branch: `claude/code-review-architecture-bGCXQ`

Pull latest before starting:
```bash
git pull origin claude/code-review-architecture-bGCXQ
```

---

## BUG 1 — Vitals: Wrong sort order + history missing temp/weight/sugar

### Root cause
`subscribeActivePatient()` orders vitals by `orderBy('recordedAt', 'desc')` but `recordedAt` is a **location string** ("home"/"hospital") — not a date. So ordering is wrong.

History rows also only show BP/Pulse/SpO2, omitting Temperature, Weight, Blood Sugar.

### Fix

**Step 1** — Find this line in `subscribeActivePatient()`:
```js
const u6 = onSnapshot(query(collection(db, `${base}/vitals`), orderBy('recordedAt', 'desc')), ...
```
Change `orderBy('recordedAt', 'desc')` to `orderBy('date', 'desc')`.

**Step 2** — In `renderHealthVitals()`, find the history section (`vitals.slice(1).map`). Replace the right-side div that only shows BP/Pulse/SpO2 with:
```js
<div style="text-align:right;font-size:12px;font-family:'DM Mono',monospace">
  ${v.bp_systolic ? `<div>BP ${safeHtml(String(v.bp_systolic))}/${safeHtml(String(v.bp_diastolic||'?'))}</div>` : ''}
  ${v.pulse     ? `<div>Pulse ${safeHtml(String(v.pulse))} bpm</div>` : ''}
  ${v.spo2      ? `<div>SpO2 ${safeHtml(String(v.spo2))}%</div>` : ''}
  ${v.temperature ? `<div>Temp ${safeHtml(String(v.temperature))}°F</div>` : ''}
  ${v.weight    ? `<div>Wt ${safeHtml(String(v.weight))} kg</div>` : ''}
  ${v.bloodSugar ? `<div>Sugar ${safeHtml(String(v.bloodSugar))} mg/dL</div>` : ''}
</div>
```

**Step 3** — Also add a mini sparkline trend row above History. After the latest reading card and before the History title, add:
```js
${vitals.length > 2 ? `
  <div class="health-card" style="margin-bottom:12px">
    <div class="health-card-title" style="margin-bottom:8px">📈 BP Trend (last ${Math.min(vitals.length,5)} readings)</div>
    <div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--gold);line-height:2">
      ${vitals.slice(0,5).reverse().map((v,i) => v.bp_systolic
        ? `<span style="opacity:${0.5 + i*0.1}">${safeHtml(String(v.bp_systolic))}/${safeHtml(String(v.bp_diastolic||'?'))}</span>`
        : '').filter(Boolean).join(' → ')}
    </div>
  </div>` : ''}
```

---

## BUG 2 — OCR: Thermometer reads 91.1°F as 97 + poor device support

### Root cause
`parseVitalsFromImage()` sends a generic prompt to Claude Vision with no explicit decimal/unit preservation rules, no sanity validation, and no guidance on reading LCD thermometer digit "1" vs "7".

### Fix

In `parseVitalsFromImage()`, replace the `system` and `prompt` variables with:

```js
const system = `You are a medical device OCR specialist. You extract precise vital sign readings from photos of medical devices, lab reports, and health documents.
RULES:
- Preserve ALL decimal points exactly (91.1 is NOT 97, 98.6 is NOT 98)
- For thermometers: LCD digits — the digit "1" is narrow, "7" has a top bar. Read carefully.
- Temperature plausible range: 95°F–107°F (35°C–41.7°C). Reject readings outside this.
- Blood pressure: systolic 60–250, diastolic 40–150. Reject outside range.
- SpO2: 70–100%. Pulse: 30–200 bpm. Weight: 10–300 kg.
- If a reading is ambiguous, return your best guess with a "?" suffix (e.g. "91.1?").
- Detect units (°F vs °C, kg vs lbs) and normalize: convert °C→°F (multiply by 1.8, add 32), lbs→kg (divide by 2.205).
- If a field is not visible or not applicable, omit it from JSON entirely.`;

const prompt = `Extract ALL visible vital signs from this image. Look for: thermometer display, oximeter reading, BP monitor, weighing scale, glucose meter, or any medical document with vital values.

Return ONLY a valid JSON object using these exact keys (include only values you can see):
{
  "bp_systolic": number,
  "bp_diastolic": number,
  "pulse": number,
  "spo2": number,
  "temperature": number,
  "temperatureUnit": "F",
  "weight": number,
  "bloodSugar": number,
  "perfusionIndex": number,
  "notes": "any relevant context e.g. fasting/post-meal/device brand"
}

CRITICAL: Preserve decimal values exactly. Double-check each digit. Do not round or approximate.`;
```

After `safeParseJSON(text)`, add sanity validation before returning:
```js
const raw = safeParseJSON(text);
if (!raw) return null;
// Sanity clamp — reject physiologically impossible values silently
if (raw.temperature && (raw.temperature < 90 || raw.temperature > 110)) delete raw.temperature;
if (raw.spo2 && (raw.spo2 < 70 || raw.spo2 > 100)) delete raw.spo2;
if (raw.bp_systolic && (raw.bp_systolic < 60 || raw.bp_systolic > 260)) delete raw.bp_systolic;
if (raw.pulse && (raw.pulse < 25 || raw.pulse > 220)) delete raw.pulse;
return raw;
```

Also in `openVitalPhotoOCR()`, after pre-filling the modal, add a user-visible note:
```js
showToast('Values pre-filled — please verify before saving');
```

And add the `perfusionIndex` and `notes` fields to the vital entry modal (`modal-health-vital`) — two new optional inputs:
- `id="hv2-pi"` label "Perf. Index (%)" type number step 0.1
- `id="hv2-ocr-notes"` label "Device notes" type text

Save these in `saveVital()` using the same pattern as other fields.

---

## BUG 3 — Report preview reverts to upload state

### Root cause
`window.closeModal` at the bottom of the file resets `_pendingReport = null` every time the report modal closes — including when it closes due to a background overlay tap. Also `openAddReportModal` always resets preview to hidden.

If a Firestore listener fires `renderHealthReports()` while the modal is open, that causes no direct issue — but the **overlay tap handler** closes the modal and wipes `_pendingReport` before the user can save.

### Fix

**Step 1** — Find the `openAddReportModal` window export:
```js
window.openAddReportModal = () => {
  _pendingReport = null;
  ...
  if (preview) preview.style.display = 'none';
  if (upload) upload.style.display = 'block';
```
Change it to only reset state if there is NO pending report already:
```js
window.openAddReportModal = () => {
  // Only reset if no report is already being previewed
  if (!_pendingReport) {
    const input = document.getElementById('health-report-input');
    if (input) input.value = '';
    const preview = document.getElementById('health-report-preview');
    if (preview) preview.style.display = 'none';
    const upload = document.getElementById('health-report-upload');
    if (upload) upload.style.display = 'block';
    const analysis = document.getElementById('health-report-analysis');
    if (analysis) analysis.innerHTML = '';
  }
  openModal('modal-health-report');
};
```

**Step 2** — Find the overlay click handler:
```js
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m){ m.classList.remove('open'); clearEditMode(); }}));
```
Replace with a version that does NOT wipe `_pendingReport` on accidental tap:
```js
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => {
  if (e.target === m) {
    // If user has a pending report preview, require explicit cancel — don't dismiss on background tap
    if (m.id === 'modal-health-report' && _pendingReport) return;
    m.classList.remove('open');
    clearEditMode();
  }
}));
```

**Step 3** — Add an explicit Cancel button inside the report modal preview section. Find `health-report-preview` div in the HTML and add after the Save button:
```html
<button class="btn-ghost" onclick="window.openAddReportModal._reset()">✕ Cancel & Upload New</button>
```
Then add a reset helper right after the `openAddReportModal` export:
```js
window.openAddReportModal._reset = () => {
  _pendingReport = null;
  document.getElementById('health-report-input').value = '';
  document.getElementById('health-report-preview').style.display = 'none';
  document.getElementById('health-report-upload').style.display = 'block';
  document.getElementById('health-report-analysis').innerHTML = '';
};
```

---

## BUG 4 — Prescription photo only saves first medicine

### Root cause
`handleMedPhoto()` calls `meds[0]` and fills a single-med form. A prescription can have 5-10 medications.

### Fix

**Step 1** — Add a new modal `modal-med-review` in HTML just after `modal-health-med`:
```html
<!-- PRESCRIPTION REVIEW -->
<div class="modal-overlay" id="modal-med-review">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title">Review Parsed Medications <button class="modal-close" onclick="closeModal('modal-med-review')">✕</button></div>
    <div style="font-size:11px;color:var(--text-faint);margin-bottom:12px">Edit fields as needed, then save all at once.</div>
    <div id="med-review-list"></div>
    <button class="btn-primary" onclick="saveAllParsedMeds()" style="margin-top:8px">Save All Medications</button>
  </div>
</div>
```

**Step 2** — Replace `handleMedPhoto()` entirely:
```js
async function handleMedPhoto(input) {
  const file = input.files[0]; if(!file) return;
  showToast('Reading prescription…');
  try {
    const reader = new FileReader();
    const base64NoPrefix = await new Promise((res, rej) => {
      reader.onload = e => res(e.target.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const system = `You are a clinical pharmacist OCR assistant. Extract ALL medications from prescriptions, discharge summaries, or pharmacy labels.`;
    const prompt = `Extract every medication from this prescription/document. Return ONLY a JSON array. Each item: {"name":"","dose":"","frequency":"","timing":"","notes":"","duration":""}. Include ALL medications visible, even if partially legible. If a field is unclear, make your best guess and add "(approx)" to the value.`;
    const res = await callClaudeVision(system, prompt, base64NoPrefix, LLM_MODELS.medicationParse);
    const meds = safeParseJSON(res);
    if (!meds || !meds.length) { showToast('No medications found in image'); return; }
    // Build review UI
    window._parsedMeds = meds;
    document.getElementById('med-review-list').innerHTML = meds.map((m, i) => `
      <div style="background:var(--surface);border-radius:var(--r-md);padding:12px;margin-bottom:10px;border:1px solid var(--gold-border)">
        <div style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:8px">Medicine ${i+1}</div>
        <input class="form-input" style="margin-bottom:6px" value="${safeHtml(m.name||'')}" placeholder="Name" oninput="window._parsedMeds[${i}].name=this.value">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
          <input class="form-input" value="${safeHtml(m.dose||'')}" placeholder="Dose" oninput="window._parsedMeds[${i}].dose=this.value">
          <input class="form-input" value="${safeHtml(m.frequency||'')}" placeholder="Frequency" oninput="window._parsedMeds[${i}].frequency=this.value">
        </div>
        <input class="form-input" style="margin-bottom:6px" value="${safeHtml(m.timing||'')}" placeholder="Timing (e.g. after meals)" oninput="window._parsedMeds[${i}].timing=this.value">
        <input class="form-input" value="${safeHtml(m.notes||'')}" placeholder="Notes / Duration" oninput="window._parsedMeds[${i}].notes=this.value">
      </div>
    `).join('');
    closeModal('modal-health-med');
    openModal('modal-med-review');
  } catch(e) { console.error(e); showToast('Prescription reading failed'); }
}
```

**Step 3** — Add `saveAllParsedMeds()` function right after `handleMedPhoto`:
```js
async function saveAllParsedMeds() {
  const meds = window._parsedMeds;
  if (!meds || !meds.length || !activeHealthProfileId) return;
  try {
    const base = `families/${FID}/healthProfiles/${activeHealthProfileId}`;
    for (const m of meds) {
      if (!m.name) continue;
      await addDoc(collection(db, `${base}/medications`), {
        name: m.name.trim(), dose: m.dose||'', frequency: m.frequency||'',
        timing: m.timing||'', notes: m.notes||'', active: true, addedAt: serverTimestamp()
      });
    }
    await addDoc(collection(db, `${base}/timeline`), {
      date: todayStr(), type: 'medication',
      title: `${meds.filter(m=>m.name).length} meds added from prescription`,
      addedAt: serverTimestamp()
    });
    showToast(`${meds.filter(m=>m.name).length} medications saved ✓`);
    closeModal('modal-med-review');
    window._parsedMeds = null;
  } catch(e) { console.error(e); showToast('Error saving medications'); }
}
```

**Step 4** — Export `saveAllParsedMeds` to window at the exports section:
```js
window.saveAllParsedMeds = saveAllParsedMeds;
```

---

## ARCHITECTURE — Generic Health (any disease, not just cancer)

### Problem
`TARGET_MARKERS` in `getKeyMarkers()` is hardcoded to cancer/liver markers. Users with diabetes, cardiac, kidney, thyroid conditions need different markers.

### Fix

**Step 1** — Replace the hardcoded `TARGET_MARKERS` array inside `getKeyMarkers()` with a condition-aware function:

```js
function getTargetMarkersForProfile(profile) {
  // Universal baseline always shown if present
  const UNIVERSAL = ['hemoglobin','haemoglobin','wbc','platelets','creatinine','albumin'];
  // Condition keyword → additional markers
  const CONDITION_MAP = [
    { keywords: ['liver','hepat','cirrhosis','hcc','cholangiocarcinoma'],
      markers: ['ca 19-9','ca19-9','afp','cea','bilirubin','alt','sgpt','ast','sgot','alkaline phosphatase','alp'] },
    { keywords: ['diabetes','diabetic','sugar','glucose','hba1c'],
      markers: ['hba1c','fasting glucose','post prandial','blood sugar','insulin'] },
    { keywords: ['cardiac','heart','coronary','cad','hypertension'],
      markers: ['ldl','hdl','cholesterol','triglycerides','troponin','bnp','creatine kinase'] },
    { keywords: ['kidney','renal','ckd','nephro'],
      markers: ['creatinine','urea','bun','egfr','uric acid','potassium','sodium'] },
    { keywords: ['thyroid','hypothyroid','hyperthyroid','tsh'],
      markers: ['tsh','t3','t4','free t4','free t3'] },
    { keywords: ['cancer','carcinoma','tumour','tumor','oncology'],
      markers: ['ca 19-9','ca19-9','afp','cea','ca 125','psa','ldh','beta hcg'] },
    { keywords: ['lungs','lung','pulmonary','copd','asthma'],
      markers: ['pef','fev1','spo2','d-dimer'] },
  ];
  const diag = ((profile && profile.diagnosis) || '').toLowerCase();
  const extra = [];
  for (const c of CONDITION_MAP) {
    if (c.keywords.some(k => diag.includes(k))) extra.push(...c.markers);
  }
  return [...new Set([...extra, ...UNIVERSAL])];
}
```

**Step 2** — Change `getKeyMarkers(reports)` signature to `getKeyMarkers(reports, profile)` and replace the hardcoded `TARGET_MARKERS` constant inside with:
```js
const TARGET_MARKERS = getTargetMarkersForProfile(profile);
```

**Step 3** — Update every call to `getKeyMarkers` to pass the profile:
- In `renderHealthOverview()`: `const markers = getKeyMarkers(activePatientData.reports);`
  → change to: `const markers = getKeyMarkers(activePatientData.reports, p);`

**Step 4** — Update the unit test `tests/health-unit.test.js` to add a test for the new architecture:
Add this test block after the existing getKeyMarkers tests:
```js
console.log('\n═══ getTargetMarkersForProfile — Condition-Aware Markers ═══');
test('liver cancer diagnosis includes AFP and CA 19-9', () => {
  const profile = { diagnosis: 'Hepatocellular Carcinoma (Liver Cancer)' };
  const markers = getTargetMarkersForProfile(profile);
  expect(markers.some(m => m.includes('afp'))).toBeTruthy();
  expect(markers.some(m => m.includes('ca 19-9') || m.includes('ca19-9'))).toBeTruthy();
});
test('diabetes diagnosis includes hba1c', () => {
  const profile = { diagnosis: 'Type 2 Diabetes Mellitus' };
  const markers = getTargetMarkersForProfile(profile);
  expect(markers.some(m => m.includes('hba1c'))).toBeTruthy();
});
test('cardiac diagnosis includes cholesterol', () => {
  const profile = { diagnosis: 'Coronary Artery Disease' };
  const markers = getTargetMarkersForProfile(profile);
  expect(markers.some(m => m.includes('cholesterol'))).toBeTruthy();
});
test('unknown condition still returns universal markers', () => {
  const profile = { diagnosis: 'Unknown condition' };
  const markers = getTargetMarkersForProfile(profile);
  expect(markers.some(m => m.includes('hemoglobin'))).toBeTruthy();
  expect(markers.some(m => m.includes('creatinine'))).toBeTruthy();
});
test('null profile returns universal markers without crash', () => {
  const markers = getTargetMarkersForProfile(null);
  expect(markers.some(m => m.includes('hemoglobin'))).toBeTruthy();
});
```
Also add `getTargetMarkersForProfile` to the extracted functions section of the unit test file so the tests can run.

---

## AFTER ALL FIXES

### Run unit tests — must be green before deploy
```bash
node tests/health-unit.test.js
```
Expected: All tests pass (≥63 with new architecture tests).

### Regression smoke check in browser (before deploy)
1. Open Chrome DevTools → Console
2. Open any patient dashboard → Overview tab
3. Confirm: no red errors, overview renders with all sections
4. Vitals tab: add a vital → confirm it saves and appears at top of history list with all fields
5. Meds tab: tap photo icon → upload any image → confirm review modal appears with multiple entries
6. Check Finance tab still works, Tasks tab still works

### Commit message to use
```
fix(health): vitals ordering + OCR robustness + report preview + multi-med prescription + generic markers

Bug fixes:
- Vitals: order by date DESC (was incorrectly ordering by recordedAt string)
- Vitals history: show all 6 fields (temp, weight, sugar were missing from history rows)
- Vitals: add BP trend sparkline above history list
- OCR: stronger prompt with decimal preservation, LCD digit guidance, unit normalization (°C→°F, lbs→kg), sanity range validation
- OCR: add perfusionIndex + notes fields to vital modal and saveVital
- Report preview: block accidental background-tap dismiss when report parsed but not yet saved
- Report preview: explicit Cancel button instead of relying on overlay tap
- Prescription: show full multi-med review modal (was only saving meds[0])
- Prescription: editable review fields for all parsed meds, save all in one action

Architecture:
- getKeyMarkers() now condition-aware via getTargetMarkersForProfile()
- Supports liver/cardiac/diabetes/kidney/thyroid/lung/generic cancer conditions
- Falls back to universal markers (Hb, WBC, platelets, creatinine, albumin) for unknown conditions
- Unit tests updated: 63+ tests covering new condition-map logic
```

### Deploy
```bash
firebase deploy --only hosting
```

Then hard-refresh the browser (Shift+Reload on desktop, close+reopen tab on mobile).

---

*End of prompt.*
