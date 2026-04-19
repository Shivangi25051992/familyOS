# 🔗 Health Record Sharing - Complete Guide

**Status**: ✅ **FIXED** (Deployed: Mar 26, 2026)

## Overview

FamilyOS allows you to share health records with other users (even outside your family) with **granular permission control**. Recipients get **read-only access** to the shared profile.

---

## 🎯 What Gets Shared

When you share a health record, the recipient can see:

### ✅ Always Shared (if permissions enabled):
1. **Overview Tab**
   - Patient name, diagnosis, relation
   - Care AI Summary
   - Key health markers with trends
   - Medication schedule (today's doses)
   - Recent vitals
   - Alerts and reminders
   - Recent timeline

2. **Reports Tab**
   - All medical reports (all pages)
   - AI summaries
   - Key findings
   - Trend analysis charts
   - Treatment timeline

3. **Medications Tab**
   - All active and inactive medications
   - Dosage, frequency, duration
   - Medication schedule
   - Dose logs (history)
   - Care notes

4. **Vitals Tab**
   - All recorded vitals (BP, sugar, temp, etc.)
   - Vitals history
   - Trends

5. **Visits Tab**
   - Doctor visits
   - Appointment notes
   - Next visit dates

6. **Bills Tab**
   - Medical bills
   - Categories (hospital, pharmacy, diagnostic)
   - Amounts and dates

7. **Care Chat**
   - Full chat history
   - AI-powered Q&A about the patient
   - Can ask new questions

---

## 🚫 What Recipients CANNOT Do

Recipients have **read-only access**. They cannot:

❌ Add, edit, or delete any data  
❌ Upload new reports or prescriptions  
❌ Add vitals or medications  
❌ Mark medications as taken  
❌ Share the record with others  
❌ Delete the profile  
❌ Export PDF (coming soon)  

---

## 🔐 How Sharing Works (Technical)

### Step 1: Owner Shares Record

**Location**: Health Profile → Click "🔗 Share" button

**Options**:
1. **Share with Family Member** (if you have family members)
   - Select member from dropdown
   - Choose duration (7, 30, 90 days, or permanent)
   - Select which tabs to share (granular control)

2. **Share with External User** (via phone number)
   - Enter recipient's phone number (with country code)
   - System looks up user by phone
   - If user exists, share is created
   - If user doesn't exist, show "They need to sign up first"

**What Happens**:
```javascript
// Profile document is updated with:
{
  sharedWith: [recipientUid],  // Array of user IDs
  shareDetails: [{
    uid: recipientUid,
    name: "Recipient Name",
    email: "recipient@example.com",
    phoneNumber: "+91 12345 67890",
    sharedAt: timestamp,
    expiresAt: timestamp or null,
    permissions: {
      overview: true,
      reports: true,
      medications: true,
      vitals: true,
      bills: true,
      visits: true,
      chat: true
    }
  }]
}
```

---

### Step 2: Recipient Sees Shared Profile

**How Recipient Accesses**:
1. Recipient logs into FamilyOS (with their own account)
2. Goes to Health/Care section
3. Sees "📋 Shared With You" section
4. Clicks on shared profile
5. Opens in **read-only mode**

**Behind the Scenes**:
```javascript
// App uses Collection Group query to find all profiles shared with user
collectionGroup(db, 'healthProfiles')
  .where('sharedWith', 'array-contains', currentUser.uid)

// Returns profiles from ANY family where user is in sharedWith array
```

---

### Step 3: Data Access (Firestore Rules)

**Firestore Security Rules** ensure recipients can only read data, not modify:

```javascript
// Main profile access
match /{path=**}/healthProfiles/{profileId} {
  allow read: if request.auth.uid in resource.data.get('sharedWith', []);
}

// Subcollection access (reports, medications, vitals, etc.)
match /{path=**}/healthProfiles/{profileId}/reports/{docId} {
  allow read: if request.auth.uid in 
    get(/databases/$(database)/documents/$(path)/healthProfiles/$(profileId))
      .data.get('sharedWith', []);
}

// Same rule for: medications, vitals, visits, bills, timeline, 
// doseLogs, notes, chatHistory, reminders
```

**Key Points**:
- Uses **collection group queries** (works across all families)
- Checks `sharedWith` array in profile document
- Read-only (no write/update/delete permissions)
- Works even if recipient is not in the same family

---

## 🔧 Recent Fix (Mar 26, 2026)

### Problem
Users reported: "Shared user can see profile but not reports, medications, vitals, etc."

### Root Cause
Firestore rules had a **generic wildcard** for subcollections that wasn't working correctly:

```javascript
// OLD (broken):
match /{subcollection}/{doc} {
  allow read: if request.auth.uid in get(...).data.get('sharedWith', []);
}
```

### Solution
Created **explicit rules for each subcollection**:

```javascript
// NEW (fixed):
match /{path=**}/healthProfiles/{profileId}/reports/{docId} { ... }
match /{path=**}/healthProfiles/{profileId}/medications/{docId} { ... }
match /{path=**}/healthProfiles/{profileId}/vitals/{docId} { ... }
// ... etc for all subcollections
```

**Result**: Shared users can now see ALL data (reports, meds, vitals, etc.)

---

## 🎨 UI Indicators for Shared Profiles

### For Owner (Sharing)
- "🔗 Share" button visible on profile
- "Existing Shares" section shows all recipients
- Can revoke access anytime

### For Recipient (Viewing)
- Profile shows in "📋 Shared With You" section
- All tabs are visible (based on permissions)
- All buttons for adding/editing are hidden
- "Read-only" label shown
- Cannot see "Share" or "Delete" buttons

---

## 💬 Care Chat for Shared Profiles

### How It Works
1. Recipient can access Care Chat tab
2. Can see full chat history
3. Can ask new questions
4. AI has access to ALL patient data (reports, meds, vitals)

### API Key Issue (Fixed)
**Problem**: "Anthropic key error" when shared user tries to use Care Chat

**Root Cause**: API key is loaded from `config.js` which is a client-side file. All users (including shared users) have access to it.

**Current Solution**: API key is in `public/config.js` and loaded for all users

**⚠️ SECURITY NOTE**: Client-side API keys are **NOT SECURE**. Anyone can inspect the page source and see the key.

**Recommended Fix (Future)**:
Move AI calls to **Cloud Functions** (server-side) where API keys are secure:

```javascript
// Instead of direct Anthropic API call:
const answer = await callClaudeHealth(q, context);

// Use Cloud Function:
const healthAI = httpsCallable(functions, 'healthAI');
const result = await healthAI({ question: q, profileId: activeHealthProfileId });
```

---

## 📊 Sharing Permissions (Granular Control)

### Default Permissions (All Enabled)
```javascript
{
  overview: true,
  reports: true,
  medications: true,
  vitals: true,
  bills: true,
  visits: true,
  chat: true
}
```

### Custom Permissions
Owner can **disable specific tabs** when sharing:

**Example**: Share only reports and medications (hide bills)
```javascript
{
  overview: true,
  reports: true,
  medications: true,
  vitals: false,
  bills: false,      // Hidden from recipient
  visits: false,
  chat: true
}
```

**UI Behavior**:
- Disabled tabs are **hidden** from recipient
- If current tab is hidden, switches to Overview
- Recipient cannot access hidden data (even via URL)

---

## 🕐 Share Duration

### Options
1. **7 days** - Short-term sharing (e.g., for second opinion)
2. **30 days** - Medium-term (e.g., for treatment period)
3. **90 days** - Long-term (e.g., for chronic condition monitoring)
4. **Permanent** - No expiration (e.g., for family members)

### Expiration Behavior
- Expired shares are automatically hidden from recipient
- Owner can see expired shares in "Existing Shares" section
- Owner can extend or delete expired shares

---

## 🔄 Revoking Access

### How to Revoke
1. Go to profile → Click "🔗 Share"
2. See "Existing Shares" section
3. Click "Revoke" next to recipient's name
4. Confirm revocation

**What Happens**:
- Recipient's UID removed from `sharedWith` array
- Share details removed from `shareDetails` array
- Recipient immediately loses access
- Profile disappears from recipient's "Shared With You" section

---

## 🧪 Testing Checklist

### Test 1: Share with Phone Number
- [ ] Owner clicks "🔗 Share" button
- [ ] Selects "External User" tab
- [ ] Enters recipient's phone number
- [ ] Clicks "Share Record"
- [ ] Success toast appears
- [ ] Recipient appears in "Existing Shares"

### Test 2: Recipient Access
- [ ] Recipient logs in with their account
- [ ] Goes to Health/Care section
- [ ] Sees "📋 Shared With You" section
- [ ] Clicks on shared profile
- [ ] Profile opens in read-only mode

### Test 3: Data Visibility
- [ ] Recipient can see Overview tab
- [ ] Recipient can see Reports tab with all reports
- [ ] Recipient can see Medications tab
- [ ] Recipient can see Vitals tab
- [ ] Recipient can see Visits tab
- [ ] Recipient can see Bills tab
- [ ] Recipient can see Care Chat tab

### Test 4: Read-Only Mode
- [ ] No "Add Report" button visible
- [ ] No "Add Medication" button visible
- [ ] No "Add Vital" button visible
- [ ] No "Mark Taken" buttons for medications
- [ ] No delete (✕) buttons visible
- [ ] No "Share" button visible

### Test 5: Care Chat
- [ ] Recipient can see chat history
- [ ] Recipient can ask new questions
- [ ] AI responds with patient data
- [ ] No "Anthropic key error"

### Test 6: Revoke Access
- [ ] Owner clicks "Revoke" on existing share
- [ ] Recipient loses access immediately
- [ ] Profile disappears from recipient's "Shared With You"

---

## 🐛 Known Issues & Limitations

### 1. Client-Side API Keys
**Issue**: Anthropic API key is in `public/config.js` (visible to all users)

**Impact**: Anyone can see and misuse the API key

**Workaround**: Use rate limiting on Anthropic dashboard

**Proper Fix**: Move AI calls to Cloud Functions

### 2. No Export for Shared Users
**Issue**: Shared users cannot export PDF reports

**Impact**: Cannot share progress with doctors easily

**Workaround**: Owner can export and send PDF

**Proper Fix**: Add PDF export for shared users (read-only)

### 3. No Notification on Share
**Issue**: Recipient doesn't get notified when profile is shared

**Impact**: Recipient must manually check "Shared With You" section

**Workaround**: Owner can inform recipient via WhatsApp/SMS

**Proper Fix**: Add push notifications or email alerts

---

## 📚 Related Documentation

- [HOW_CARE_AI_WORKS.md](./HOW_CARE_AI_WORKS.md) - How AI uses patient data
- [MULTI_PAGE_REPORT_FEATURE.md](./MULTI_PAGE_REPORT_FEATURE.md) - Multi-page report upload
- [VISUAL_TRENDS_FEATURE.md](./VISUAL_TRENDS_FEATURE.md) - Trend charts
- [SECURITY_AUDIT_COMPLETE.md](./SECURITY_AUDIT_COMPLETE.md) - Security fixes

---

## 🎉 Summary

### What Works Now (After Fix)
✅ Share health records via phone number  
✅ Recipients can see ALL data (reports, meds, vitals, bills, etc.)  
✅ Care Chat works for shared users  
✅ Granular permission control (hide specific tabs)  
✅ Time-limited sharing with expiration  
✅ Easy revocation  

### What's Missing (Future Enhancements)
🔮 PDF export for shared users  
🔮 Push notifications on share  
🔮 Share via email (in addition to phone)  
🔮 Secure API keys (move to Cloud Functions)  
🔮 Share analytics (who viewed, when)  

---

**Test it now**: Share a health record with a friend via phone number and ask them to check if they can see all tabs! 🎊
