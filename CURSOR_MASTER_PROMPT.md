# FamilyOS — Cursor Master Prompt
# Architect: Claude Sonnet 4.6 | Execute with: claude-sonnet-4-6 in Cursor
# Branch: claude/asha-implementation-clean
# Last verified: 58/58 unit tests passing

---

## RECOMMENDED CURSOR MODEL
**Use `claude-sonnet-4-6`** (select "claude-sonnet-4" in Cursor model picker)
- Follows detailed specs precisely, best quality/cost ratio
- ~5x cheaper than Opus, same output quality for well-specified tasks
- Only switch to Opus if a specific phase produces broken code after 2 retries

---

## HOW TO USE THIS FILE
- Complete phases IN ORDER — each phase depends on the previous
- Run the regression check after EVERY phase before moving on
- If you run out of credits mid-session, this file tracks exactly where to resume
- NEVER rewrite the whole file — always use targeted edits
- Mark each phase ✅ DONE or ❌ FAILED in this file as you go

---

## QUICK START
```bash
git pull origin claude/asha-implementation-clean
node tests/health-unit.test.js   # must show 58/58 PASSED before starting
```

---

## CURRENT STATUS (verified by Claude Sonnet 4.6)

| Phase | Feature | Status | Test |
|-------|---------|--------|------|
| P1 | Asha global bar + chips | ✅ HTML exists (id=asha-bar, ASHA_CHIPS, ashaToggleMic) | Manual |
| P2 | Voice intents (vitals/notes/expense) | ✅ ashaToggleMic + parseVitalsSpeech exist | Manual |
| P3 | Audio health brief | ✅ playHealthBrief exists | Manual |
| P4 | Health record sharing modal | ❌ createHealthShare MISSING | Unit |
| P5 | Delete protection | ✅ canDeleteHealthData exists | Unit |
| P6 | Vitals sparklines | ✅ renderSparkline exists | Manual |
| P7 | Doctor brief PDF | ✅ exportHealthPDF exists | Manual |
| P8 | Prescription refill reminders | ✅ in createMedicationReminders | Manual |
| P9 | Offline IndexedDB | ✅ enableIndexedDbPersistence called | Auto |
| P10 | Light mode toggle | ❌ toggleTheme MISSING | Manual |
| P11 | Cross-module (bill→finance, visit→reminder) | ❌ NOT VERIFIED | Manual |
| P12 | API key security | ❌ Still client-side — Cloud Functions needed | Manual |
| R0 | Junk files removed (.sfdx, index-old*.html) | ✅ Done | Auto |
| R1 | Unit tests baseline | ✅ 58/58 passing | Auto |

**Resume from: Phase P4 (Health Record Sharing)**

---

## REGRESSION CHECK — RUN AFTER EVERY PHASE
```bash
node tests/health-unit.test.js
```
**Required output:** `🟢 ALL 58 TESTS PASSED`

If any test fails → STOP, fix before continuing. Do NOT proceed with a broken baseline.

Also check in browser after each phase:
- App loads without blank screen
- Health overview tab renders
- Bottom nav is visible
- Asha bar is visible above nav

---

## PHASE P4 — HEALTH RECORD SHARING (MISSING — IMPLEMENT THIS)

### What to build
Primary owner can share a patient's health record with external family members
(sister, brother) who are NOT in the family group. They get read-only access +
AI chat. They cannot edit, delete, or see other family data.

### Files to edit: `public/index.html`, `firestore.rules`

### Step 1 — Add share modal HTML
Find `<!-- end modal-health-bill -->` or the closing `</div>` after the bill modal.
Insert AFTER it:

```html
<div class="modal-overlay" id="modal-health-share">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title">Share Health Record
      <button class="modal-close" onclick="closeModal('modal-health-share')">✕</button>
    </div>
    <div style="background:var(--blue-soft);border:1px solid rgba(91,141,239,0.2);border-radius:var(--r-md);padding:12px;margin-bottom:16px;font-size:12px;color:var(--text-dim)">
      Shared users can <strong style="color:var(--text)">view records and use AI chat only</strong>.
      They cannot edit, delete, or see other family data.
    </div>
    <div class="form-group">
      <label class="form-label">Link expires in</label>
      <select class="form-select" id="share-expiry">
        <option value="7">7 days</option>
        <option value="30" selected>30 days</option>
        <option value="90">3 months</option>
        <option value="365">1 year</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Label (who is this for?)</label>
      <input class="form-input" id="share-note" placeholder="e.g. Didi in Delhi, Bhaiya">
    </div>
    <button class="btn-primary" onclick="createHealthShare()">Generate Share Link</button>
    <div id="share-result" style="display:none;margin-top:16px">
      <div style="font-size:11px;color:var(--text-faint);margin-bottom:6px;letter-spacing:1px;text-transform:uppercase;font-family:'DM Mono',monospace">Share link</div>
      <div style="background:var(--surface);border:1px solid var(--gold-border);border-radius:var(--r-md);
        padding:10px;font-size:11px;font-family:'DM Mono',monospace;word-break:break-all;
        color:var(--text-dim);margin-bottom:10px" id="share-link-display"></div>
      <div style="display:flex;gap:8px">
        <button class="btn-sm fill" onclick="copyHealthShareLink()">Copy Link</button>
        <button class="btn-sm fill" onclick="whatsappHealthShare()"
          style="background:rgba(37,211,102,0.12);border-color:rgba(37,211,102,0.25);color:#25D366">
          WhatsApp
        </button>
      </div>
    </div>
    <div id="active-shares-list" style="margin-top:20px"></div>
  </div>
</div>
```

### Step 2 — Add Share JS functions
Find `window.exportHealthPDF` export near bottom of file. Insert BEFORE it:

```javascript
let _currentShareUrl = '';

async function createHealthShare() {
  if (!activeHealthProfileId || !FID) return;
  if (myRole !== 'primary') { showToast('Only the primary owner can share records'); return; }
  const days = parseInt(document.getElementById('share-expiry')?.value || '30');
  const note = document.getElementById('share-note')?.value?.trim() || '';
  const token = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  const expiresAt = new Date(Date.now() + days * 86400000);
  try {
    await setDoc(doc(db, 'healthShares', token), {
      familyId: FID, profileId: activeHealthProfileId,
      createdBy: CU.uid, createdAt: serverTimestamp(),
      expiresAt, active: true, accessLevel: 'chat',
      sharedWithNote: note
    });
    _currentShareUrl = `${location.origin}${location.pathname}?share=${token}`;
    document.getElementById('share-link-display').textContent = _currentShareUrl;
    document.getElementById('share-result').style.display = 'block';
    loadActiveShares();
    showToast('Share link created ✓');
  } catch(e) { AppMonitor.logFailure('create_share', e.message, e); showToast('Error creating link'); }
}

function copyHealthShareLink() {
  navigator.clipboard?.writeText(_currentShareUrl)
    .then(() => showToast('Copied ✓'))
    .catch(() => { showToast('Copy failed — select and copy manually'); });
}

function whatsappHealthShare() {
  const p = data.healthProfiles?.find(x => x.id === activeHealthProfileId);
  const msg = `I'm sharing ${p?.name || 'health records'} with you via FamilyOS. View records and chat with the AI (read-only access, ${document.getElementById('share-expiry')?.value || 30} days): ${_currentShareUrl}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg));
}

async function loadActiveShares() {
  const el = document.getElementById('active-shares-list');
  if (!el || !FID || !activeHealthProfileId) return;
  try {
    const snap = await getDocs(query(
      collection(db, 'healthShares'),
      where('familyId','==',FID),
      where('profileId','==',activeHealthProfileId),
      where('active','==',true)
    ));
    if (snap.empty) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="font-size:10px;color:var(--text-faint);margin-bottom:8px;letter-spacing:1px;text-transform:uppercase;font-family:\'DM Mono\',monospace">Active shares</div>'
      + snap.docs.map(d => {
        const s = d.data();
        const exp = s.expiresAt?.toDate?.() || new Date(s.expiresAt);
        const expired = exp < new Date();
        return `<div style="display:flex;justify-content:space-between;align-items:center;
          padding:10px 0;border-bottom:1px solid var(--gold-border);font-size:12px">
          <div>
            <div style="color:var(--text);font-weight:500">${safeHtml(s.sharedWithNote || 'Unnamed')}</div>
            <div style="color:${expired?'var(--red)':'var(--text-faint)'};font-size:10px;margin-top:2px">
              ${expired ? 'EXPIRED' : 'Expires ' + exp.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
            </div>
          </div>
          <button onclick="revokeHealthShare('${d.id}')"
            style="font-size:10px;padding:4px 10px;background:var(--red-soft);
            border:1px solid rgba(229,115,115,0.3);border-radius:6px;color:var(--red);cursor:pointer">
            Revoke
          </button>
        </div>`;
      }).join('');
  } catch(e) { console.error(e); }
}

async function revokeHealthShare(shareId) {
  try {
    await updateDoc(doc(db, 'healthShares', shareId), { active: false });
    showToast('Access revoked ✓');
    loadActiveShares();
  } catch(e) { showToast('Error revoking access'); }
}

window.createHealthShare = createHealthShare;
window.copyHealthShareLink = copyHealthShareLink;
window.whatsappHealthShare = whatsappHealthShare;
window.revokeHealthShare = revokeHealthShare;
```

### Step 3 — Add Share button in patient dashboard
Find where the patient dashboard header is rendered (search for `openPatientDashboard` 
or the patient name header in health tab). Add a share button:
```javascript
// Inside the patient header HTML, add:
`${myRole === 'primary' ? `<button class="btn-sm" onclick="openModal('modal-health-share');loadActiveShares()" style="font-size:11px">🔗 Share</button>` : ''}`
```

### Step 4 — Update firestore.rules
Add this block inside the `match /databases/{database}/documents` section:
```
match /healthShares/{shareId} {
  allow read: if request.auth != null
    && resource.data.active == true
    && resource.data.expiresAt > request.time;
  allow create: if request.auth != null
    && get(/databases/$(database)/documents/families/$(request.resource.data.familyId)).data.primaryOwner == request.auth.uid;
  allow update, delete: if request.auth != null
    && get(/databases/$(database)/documents/families/$(resource.data.familyId)).data.primaryOwner == request.auth.uid;
}
```

### P4 Regression check:
```bash
node tests/health-unit.test.js  # must still be 58/58
```
Manual: Open health profile → verify Share button appears → tap → modal opens →
Generate link → copy works → WhatsApp opens with correct message.
Only primary owner sees Share button. Secondary member does not.

---

## PHASE P10 — LIGHT MODE TOGGLE (MISSING — IMPLEMENT THIS)

### What to build
A dark/light theme toggle in Settings. CSS variables for light mode already exist
(data-theme="light" block is in the CSS). Just need the toggle function + button.

### Step 1 — Add toggleTheme function
Find `window.toggleTheme` or if not found, find the exports section near bottom.
Add:
```javascript
function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.documentElement.removeAttribute('data-theme');
    LS.set('fos_theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    LS.set('fos_theme', 'light');
  }
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = isLight ? '☀️ Light mode' : '🌙 Dark mode';
}
window.toggleTheme = toggleTheme;
```

### Step 2 — Restore theme on load
Find the `init()` function or the section after Firebase init where localStorage
values are restored. Add:
```javascript
// Restore theme preference
const savedTheme = LS.get('fos_theme');
if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
```

### Step 3 — Add toggle button in Settings
Find the Settings page render function (`renderSettings` or `page-settings` section).
Add inside the appearance/preferences section:
```javascript
`<div class="toggle-row">
  <div>
    <div class="toggle-lbl">App Theme</div>
    <div class="toggle-sub">Switch between dark and light mode</div>
  </div>
  <button id="btn-theme-toggle" class="btn-sm" onclick="toggleTheme()">
    ${document.documentElement.getAttribute('data-theme') === 'light' ? '🌙 Dark mode' : '☀️ Light mode'}
  </button>
</div>`
```

### P10 Regression check:
```bash
node tests/health-unit.test.js  # 58/58
```
Manual: Settings → tap theme toggle → app switches to light mode → reload →
light mode persists. Tap again → back to dark.

---

## PHASE P11 — CROSS-MODULE INTELLIGENCE (VERIFY & FIX)

### What to verify
When a health bill is saved → it should auto-appear in Finance expenses.
When a doctor visit is saved with nextVisit date → a reminder should be auto-created.

### Step 1 — Find saveHealthBill function
Search for `async function saveHealthBill` or the function that saves to
`families/${FID}/healthProfiles/${id}/bills`.

After the successful `addDoc` for the bill, add (if not already there):
```javascript
// Auto-link to Finance expenses
if (amount > 0) {
  addDoc(collection(db, `families/${FID}/expenses`), {
    desc: `Medical: ${safeHtml(provider || 'Healthcare')} — ${safeHtml(p?.name || 'Patient')}`,
    amount: Number(amount),
    cat: 'Medical',
    date: billDate || todayStr(),
    source: 'health_auto',
    healthProfileId: activeHealthProfileId,
    addedAt: serverTimestamp()
  }).catch(e => AppMonitor.logFailure('bill_to_expense', e.message, e));
}
```

### Step 2 — Find saveVisit function
After the successful `addDoc` for the visit, add (if nextVisit field exists):
```javascript
// Auto-create reminder for doctor visit
if (nextVisit) {
  const d = new Date(nextVisit);
  d.setDate(d.getDate() - 1);
  const reminderDate = d.toISOString().split('T')[0];
  if (reminderDate >= todayStr()) {
    addDoc(collection(db, `families/${FID}/reminders`), {
      text: `Doctor visit tomorrow: ${safeHtml(doctor || 'Doctor')} — ${safeHtml(p?.name || 'Patient')}`,
      date: reminderDate,
      time: '09:00',
      type: 'Appointment',
      done: false,
      healthProfileId: activeHealthProfileId,
      addedAt: serverTimestamp(),
      source: 'auto_visit'
    }).catch(e => AppMonitor.logFailure('visit_to_reminder', e.message, e));
  }
}
```

### P11 Regression check:
```bash
node tests/health-unit.test.js  # 58/58
```
Manual: Add a health bill → check Finance page shows new Medical expense.
Add a visit with next visit date → check Activities shows new appointment reminder.

---

## PHASE P12 — API KEY SECURITY (CRITICAL)

### Current state
`callClaudeVision()` and `callClaudeHealth()` in public/index.html call
the Anthropic API directly from the browser. The API key is read from
`window.FAMILYOS_OCR_CONFIG.anthropicKey`. This exposes it to any user
who opens DevTools.

### Step 1 — Update functions/index.js
The Cloud Functions `healthAIRaw` and `healthAnalyzeImageRaw` already exist.
Verify they accept these params and return `{ text: string }`:
- `healthAIRaw`: `{ prompt, context, model, maxTokens, isCompassionatePersona }`
- `healthAnalyzeImageRaw`: `{ system, prompt, base64NoPrefix, model }`

If they don't match, update to accept those fields.

### Step 2 — Replace callClaudeVision in public/index.html
Find `async function callClaudeVision(` — replace the entire function body:
```javascript
async function callClaudeVision(system, prompt, base64NoPrefix, model) {
  const fn = httpsCallable(functions, 'healthAnalyzeImageRaw');
  const result = await fn({
    system,
    prompt,
    base64NoPrefix,
    model: model || LLM_MODELS.medicalReports
  });
  if (!result?.data?.text) throw new Error('No response from AI service');
  return result.data.text;
}
```

### Step 3 — Replace callClaudeHealth in public/index.html
Find `async function callClaudeHealth(` — replace the entire function body:
```javascript
async function callClaudeHealth(prompt, context, isCompassionatePersona, model, maxTokens) {
  const fn = httpsCallable(functions, 'healthAIRaw');
  const result = await fn({
    prompt,
    context: context || '',
    isCompassionatePersona: !!isCompassionatePersona,
    model: model || LLM_MODELS.medicalQA,
    maxTokens: maxTokens || 1000
  });
  if (!result?.data?.text) throw new Error('No response from AI service');
  return result.data.text;
}
```

### Step 4 — Remove client-side key references
Delete any `window.FAMILYOS_OCR_CONFIG = {...anthropicKey...}` assignments.
The key lives only in Cloud Function environment variables:
```bash
firebase functions:config:set anthropic.key="YOUR_NEW_KEY_HERE"
```

### Step 5 — Deploy
```bash
firebase deploy --only functions,hosting
```

### P12 Regression check:
```bash
node tests/health-unit.test.js  # 58/58
```
Manual: Upload a medical report → should still analyze (via Cloud Function).
Open DevTools Network tab → confirm no direct calls to api.anthropic.com.
All calls should go to cloudfunctions.net.

---

## PHASE P1-FIX — ASHA BAR WIRING (IF NOT WORKING IN BROWSER)

Cursor added the HTML and JS but the chips may not update when switching pages.

### Find and fix
1. Find `function goPage(` — add at end: `updateAshaChips();`
2. Find `function switchHealthTab(` — add at end: `updateAshaChips();`  
3. Find `function loadAndSubscribe(` or where data finishes loading — add: `updateAshaChips();`
4. Find `DOMContentLoaded` event — add: `updateAshaChips();`

### Asha bar regression check:
Open app → bottom Asha bar visible → switch to Health page → chips show
"How is Papa doing?" etc → switch to Finance → chips change to "Monthly spend?" etc.
Tap a chip → routes to health chat or Asha input.

---

## PHASE P2-FIX — VOICE INTENT WIRING (IF NOT WORKING)

If mic button tap does nothing:

### Check
```javascript
// Search for: window.ashaToggleMic
// If missing, add to exports:
window.ashaToggleMic = ashaToggleMic;
```

Check that `id="asha-mic-btn"` button has `onclick="ashaToggleMic()"`.

### Test voice intents manually:
- Tap mic → say "blood pressure 120 over 80" → vital modal opens, fields pre-filled
- Tap mic → say "note: papa took medicine" → toast shows "Care note saved"
- Tap mic → say "add expense 500" → expense modal opens, amount pre-filled
- Any other sentence → routed to health chat

---

## PHASE P3-FIX — AUDIO BRIEF (IF NOT WORKING)

If "Play Brief" button is missing from overview:

### Check
Search for `btn-audio-brief` in index.html.
If missing, find `_renderHealthOverviewInner` function, in the summaryHtml section
find where the "Update summary" button is, and add next to it:
```javascript
`<button id="btn-audio-brief" class="btn-sm" onclick="playHealthBrief()"
  style="background:var(--purple-soft);border:1px solid rgba(123,94,167,0.3);
  color:var(--purple)">▶ Play Brief</button>`
```

Also verify `window.playHealthBrief = playHealthBrief;` is in exports.

---

## FULL REGRESSION TEST SUITE

Run after ALL phases complete:

```bash
# 1. Unit tests
node tests/health-unit.test.js
# Expected: 58/58 PASSED

# 2. Deploy to Firebase
firebase deploy --only hosting,firestore:rules,functions

# 3. Manual checklist (open https://familyos-e3d4b.web.app)
```

### Manual Checklist

**App basics (must pass — these were working before)**
- [ ] App loads without blank screen
- [ ] Login with Google works  
- [ ] PIN/biometric lock works
- [ ] Bottom nav: Home, Finance, Activities, Health tabs work
- [ ] Adding expense works
- [ ] Adding task works
- [ ] Adding reminder works

**Health module (must pass)**
- [ ] Add patient profile works
- [ ] Upload medical report → OCR → save works
- [ ] Add medication works (single + photo/prescription)
- [ ] Mark dose as taken works
- [ ] Add vitals manually works
- [ ] Add doctor visit works
- [ ] Add bill works
- [ ] AI Care Chat works (Asha responds)
- [ ] AI Summary "Update" works

**New features (Asha Intelligence Layer)**
- [ ] P1: Asha bar visible on every page
- [ ] P1: Chips change when switching pages
- [ ] P2: Mic → say "bp 120/80" → vital modal pre-filled
- [ ] P2: Mic → say "note: gave medicine" → care note saved
- [ ] P2: Attach photo → sheet asks Report/Prescription/Bill
- [ ] P3: "Play Brief" button visible in overview → taps → audio plays
- [ ] P4: Share button visible for primary owner → generates link → WhatsApp works
- [ ] P4: Revoke share → access removed
- [ ] P5: Secondary user cannot see delete buttons
- [ ] P6: Vitals tab shows sparklines in BP/Sugar/Weight history
- [ ] P7: "Doctor Brief" button → PDF opens for print
- [ ] P8: Add med with 30-day duration → check Reminders for refill alert on day 27
- [ ] P9: Turn off network → app shows cached data without crash
- [ ] P10: Settings → theme toggle → light mode → persists on reload
- [ ] P11: Add health bill → Finance page shows auto-linked Medical expense
- [ ] P11: Add visit with next-visit date → Reminders shows appointment alert
- [ ] P12: DevTools Network → no calls to api.anthropic.com (all via Cloud Functions)

---

## COMMIT MESSAGE TO USE
```
feat(intelligence): complete Asha intelligence layer - sharing, light mode, cross-module, API security

- P4: Health record sharing with expiry + revoke (healthShares collection)  
- P10: Light/dark mode toggle with localStorage persistence
- P11: Health bill → Finance auto-sync, Visit → Reminder auto-create
- P12: All AI calls routed through Cloud Functions (no client API key)
- Bug fixes: Asha bar chip wiring, voice intent registration, audio brief button
- All 58 unit tests passing

https://claude.ai/code/session_01VjTJn6kkRBcmDDxq5Bqq64
```

---

## IF CURSOR RUNS OUT OF CREDITS MID-SESSION

1. Note which phase you just finished (check the status table at top)
2. Run: `node tests/health-unit.test.js` — if failing, do NOT commit
3. If passing: `git add public/index.html firestore.rules functions/index.js && git commit -m "wip: phase PXX complete"`
4. Push: `git push origin claude/asha-implementation-clean`
5. When credits resume: open this file, find last ✅ phase, start next one

---

## IMPORTANT RULES FOR CURSOR

1. **NEVER rewrite the whole file** — public/index.html is 11,800+ lines. Always use targeted find-and-replace edits
2. **NEVER commit without running tests first** — `node tests/health-unit.test.js` must show 58/58
3. **NEVER create backup files** — no index-old.html, no index-backup.html
4. **NEVER add unrelated files** — do not add .sfdx, Salesforce, or any non-FamilyOS files
5. **NEVER use innerHTML without safeHtml()** for user-supplied strings
6. **ALWAYS preserve existing window.* exports** — do not remove any existing exports
7. **ONE phase at a time** — complete + test before starting next
8. **After each phase**: update the STATUS TABLE at the top of this file (mark ✅ or ❌)
