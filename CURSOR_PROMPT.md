# Cursor Agent Prompt — FamilyOS Health Module: Pull → Test → Deploy → Verify

Paste the entire block below into Cursor's Composer (Agent mode).

---

## AGENT TASK: Pull latest code, run health test suite, seed test data, deploy to Firebase, and guide user through manual verification.

You are acting as a senior full-stack engineer on the FamilyOS project. Execute the following steps in order. Stop and report clearly if any step fails — do NOT proceed to deploy if tests fail.

---

### STEP 0 — Confirm you are in the right directory

```bash
pwd
ls firebase.json public/index.html tests/health-unit.test.js
```

If `firebase.json` or `tests/health-unit.test.js` are missing, stop and ask the user to open the familyOS repo folder.

---

### STEP 1 — Pull latest code from GitHub

```bash
git fetch origin
git status
git pull origin claude/code-review-architecture-bGCXQ
```

Expected: `Already up to date.` or a fast-forward merge listing changed files.
If there are merge conflicts, stop and resolve them manually before continuing.

After pull, confirm the file version:

```bash
grep -n "Health Module v2" public/index.html | head -3
grep -c "renderHealthVitals\|renderHealthChat\|buildMedSchedule" public/index.html
```

Expected output: should show 3+ matches, confirming the health redesign is present.

---

### STEP 2 — Install test dependencies

```bash
npm install --save-dev puppeteer firebase-admin dotenv
```

Verify:
```bash
node -e "require('puppeteer'); console.log('puppeteer OK')"
node -e "require('firebase-admin'); console.log('firebase-admin OK')"
```

---

### STEP 3 — Run unit tests (no Firebase, no browser needed)

```bash
node tests/health-unit.test.js
```

**Expected result: 58/58 tests passing, zero failures.**

If any tests fail:
- Read the error message carefully
- Identify which function is broken (`safeHtml`, `buildMedSchedule`, `getKeyMarkers`, etc.)
- Open `public/index.html`, find the function, fix the bug
- Re-run until all 58 pass
- Do NOT proceed to deploy with failing unit tests

---

### STEP 4 — Set up tests/.env for seed and E2E

Ask the user for the following values if tests/.env does not exist:

```
1. Firebase Project ID  (default: familyos-e3d4b — confirm with user)
2. FAMILY_ID            (the Firestore family document ID — find it in Firebase Console → Firestore → families collection → document ID)
3. Path to serviceAccount.json (Firebase Console → Project Settings → Service Accounts → Generate New Private Key)
4. APP_URL              (the deployed app URL, e.g. https://familyos-e3d4b.web.app)
```

Create the file:

```bash
cat > tests/.env << 'EOF'
FIREBASE_PROJECT_ID=familyos-e3d4b
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
FAMILY_ID=REPLACE_WITH_FAMILY_ID
APP_URL=https://familyos-e3d4b.web.app
HEADLESS=true
E2E_TIMEOUT=20000
EOF
```

Then open `tests/.env` and fill in the actual FAMILY_ID from the user.

---

### STEP 5 — Seed test patient data into Firebase

```bash
node tests/health-seed.js
```

**Expected output:**
```
Created patient profile: <some-id>
  ✓ 3 reports seeded
  ✓ 7 medications seeded
  ✓ 3 vitals seeded
  ✓ 3 visits seeded
  ✓ 8 bills seeded
  ✓ 8 timeline seeded

SEED_PATIENT_ID=<id>
SEED_FAMILY_ID=<family-id>
```

If you see `permission-denied` from Firebase Admin, the serviceAccount.json is either missing or doesn't have Firestore write access. Ask the user to re-download it with the correct permissions.

The script is idempotent — running it again will clean up the previous seed profile and create a fresh one.

---

### STEP 6 — Deploy to Firebase Hosting

Only deploy if Step 3 (unit tests) passed. Skip this step if the user says "don't deploy yet."

```bash
firebase deploy --only hosting
```

Wait for deployment to complete. Note the Hosting URL printed at the end (e.g. `https://familyos-e3d4b.web.app`).

**After deploy:** Tell the user to hard-refresh the app:
- **iOS Safari**: Close the tab entirely, reopen
- **Android Chrome**: Menu → More → Reload (or Shift+Reload)
- **Desktop Chrome**: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

---

### STEP 7 — Run E2E browser tests (optional, post-deploy)

```bash
HEADLESS=false node tests/health-e2e.test.js
```

Setting `HEADLESS=false` opens a visible Chrome window so you can watch the tests run.

**Note**: E2E tests will stop at the login screen if the user is not signed in. The unit tests (Step 3) are the primary automated validation. E2E tests are secondary/visual confirmation.

---

### STEP 8 — Manual Verification Checklist

After deploy, ask the user to test the following scenarios in the app. For each item, tell the user exactly what to do and what to expect.

#### 8A. Health Module — Overview Tab
**Steps**: Open app → Health → tap "Arun Sharma [TEST-SEED]"
**Expected**:
- [ ] Patient name and diagnosis show in header
- [ ] 7 tabs visible: Overview | Vitals | Meds | Reports | Visits | Bills | Ask AI
- [ ] AI Case Summary card shows with a teaser text (collapsed by default)
- [ ] Tap the summary card — it expands to show the full summary
- [ ] Tap again — it collapses back
- [ ] Key Markers section shows: AFP, CA 19-9, Bilirubin, Hemoglobin with values and trend arrows (↓ for improving)
- [ ] "Today's Medicines" section shows morning/night/afternoon slots with Mark Taken buttons
- [ ] Stats row shows: 3 Reports · 6 Meds · Next Visit date · ₹1,26,600 Bills
- [ ] Recent Timeline shows last 4 events

#### 8B. Mark a Dose as Taken
**Steps**: Overview tab → find "Sorafenib" in Today's Medicines → tap "Mark Taken"
**Expected**:
- [ ] Button changes to "✓ Done" and becomes disabled
- [ ] Card turns slightly green/faded
- [ ] Switch to Meds tab — same slot shows the dose as done
- [ ] Come back to Overview — dose remains marked (persisted to Firestore)

#### 8C. Vitals Tab
**Steps**: Tap "Vitals" tab
**Expected**:
- [ ] Latest reading card shows: BP 118/76, Pulse 78, SpO2 97%, Temp 98.4°F, Weight 68kg
- [ ] History section shows 2 older readings below
- [ ] Tap "+ Add" — vital entry modal opens with today's date pre-filled
- [ ] Fill in BP: 115/75, Pulse: 74, SpO2: 99 → tap Save
- [ ] Modal closes, new reading appears at top of Vitals tab
- [ ] Go back to Overview — "Latest Vitals" card updates to new values

#### 8D. Meds Tab — Today's Schedule
**Steps**: Tap "Meds" tab
**Expected**:
- [ ] "Today's Schedule" card at top with time slots
- [ ] Morning slot: Sorafenib, Ursodeoxycholic Acid, Lactulose, Furosemide, Pantoprazole
- [ ] Afternoon slot: Ursodeoxycholic Acid (TID)
- [ ] Night slot: Sorafenib, Ursodeoxycholic Acid (BD/TID)
- [ ] Active medications list below with Stop buttons
- [ ] Inactive section shows Spironolactone (stopped)

#### 8E. Reports Tab — Key Findings
**Steps**: Tap "Reports" tab
**Expected**:
- [ ] 3 report cards visible: October, November, December
- [ ] Most recent (December) at top with "watch" badge
- [ ] Tap any report card — expands to show Key Findings table (AFP, CA 19-9, Bilirubin etc.)
- [ ] Tap again — collapses

#### 8F. Visits Tab
**Steps**: Tap "Visits" tab
**Expected**:
- [ ] 3 visit cards: Dec 5 (latest), Nov, Oct
- [ ] Each shows hospital name, doctor, type badge, notes, action items
- [ ] Latest visit shows "Next Visit: [date ~28 days from today]"

#### 8G. Bills Tab
**Steps**: Tap "Bills" tab
**Expected**:
- [ ] Total cost card at top showing ₹1,26,600
- [ ] 8 bill items listed with date, hospital, category, amount
- [ ] Apollo Pharmacy shows ₹87,500 (Sorafenib)

#### 8H. Ask AI Chat Tab
**Steps**: Tap "Ask AI" tab
**Expected**:
- [ ] Full-height chat window with welcome bubble from AI
- [ ] Previous Q&A ("Is the AFP trend improving?") shown in chat history
- [ ] Type "What is Arun's latest AFP value?" → tap Send
- [ ] Typing indicator (dots) appears while AI thinks
- [ ] AI responds with relevant answer (about 780 ng/mL, Dec reading)
- [ ] Chat persists if you leave and come back

#### 8I. Navigation Regression
**Steps**: After health testing, navigate to Finance, Tasks, Kids, Activities
**Expected**:
- [ ] All other modules still work normally
- [ ] No console errors
- [ ] Bottom nav works correctly

#### 8J. Return to Patient List
**Steps**: Tap the ← back button in the patient header
**Expected**:
- [ ] Returns to patient list showing all profiles
- [ ] Test profile "Arun Sharma [TEST-SEED]" visible
- [ ] Can open patient again — data still there

---

### STEP 9 — Report Results

After the user completes the manual verification checklist, ask them to confirm:
1. How many items in the checklist passed?
2. Were there any items that failed? If so, which ones?
3. Are there any visual/UX issues even if functionality works?

Based on their answers, identify what to fix next.

---

### IF SOMETHING IS BROKEN

Common issues and fixes:

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Overview shows "Overview failed to load: safeHtml is not defined" | Deployed stale version without safeHtml | Run `git pull` then `firebase deploy` again |
| Overview is blank (no error) | JS error in renderHealthOverview | Open browser console (F12) → read the error → report it |
| Meds tab shows no schedule | Medications have unusual frequency text | Check frequency strings in Firestore match OD/BD/TID/QID patterns |
| Mark Taken button doesn't change | logDose() failing | Check browser console for Firestore permission error |
| Vitals tab empty | vitals subscription failing | Check Firestore rules allow reads on vitals subcollection |
| Chat doesn't send | callClaudeHealth() failing | Check Firebase Functions are deployed (`firebase deploy --only functions`) |
| Seed script fails with permission-denied | Wrong service account | Re-download service account from Firebase Console |

---

*End of Cursor agent prompt. Paste everything above the dashed line into Cursor Composer (Agent mode).*
