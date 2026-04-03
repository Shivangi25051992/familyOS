# 🔒 SECURITY AUDIT FINDINGS - FamilyOS

## CRITICAL SECURITY VULNERABILITIES FOUND

### 1. FIRESTORE RULES: Too Permissive
**File:** `firestore.rules`
**Issue:** Lines 25-31

```javascript
function isFamilyMember(familyId) {
  let members = fam != null ? fam.get('members', []) : [];
  let memberProfiles = fam != null ? fam.get('memberProfiles', {}) : {};
  return request.auth != null
    && fam != null
    && (request.auth.uid in members || request.auth.uid in memberProfiles);
}
```

**Problem:** Checks if UID is in `members` array OR `memberProfiles` object keys. The `members` array currently stores UIDs, but `memberProfiles` is an object where keys are UIDs. The check `request.auth.uid in memberProfiles` checks if the UID is a KEY in the object, which works. However, there's no `memberUids` flat array for efficient rules evaluation.

**Impact:** MEDIUM - Rules work but are inefficient

---

### 2. INVITE GENERATION: No Rate Limiting
**File:** `public/index.html`
**Function:** `window.openInviteModal` (Line 4012)

```javascript
window.openInviteModal=async()=>{
  // ... no rate limit check ...
  const fn=httpsCallable(functions,'createInvite');
  const res=await fn({fid:FID});
  // Creates new invite EVERY time
}
```

**Problem:**
- No check for existing active invites
- User can click "Invite Member" 100 times → creates 100 invites
- No deduplication
- No rate limiting

**Impact:** HIGH - Hundreds of duplicate invitations created

---

### 3. FAMILY DATA ISOLATION: Missing Verification
**File:** `public/index.html`
**Function:** `loadAndSubscribe` (Line 3322)

**Current behavior:**
- Line 2842: `FID=uDoc.data().familyId;` - Gets family ID from user doc
- Line 3333: `const fDoc=await getDoc(doc(db,'families',FID));` - Loads family
- Line 3353: **Security check added** - Verifies user is in members array
- ✅ This is CORRECT

**However, there's a potential bug:**
- If `uDoc` doesn't exist (new phone user)
- Line 2880: `FID = null;` - Clears FID
- But if there's a cached FID in browser memory from previous user
- The app might still load that family

**Impact:** CRITICAL - Phone users seeing other users' data

---

### 4. SIGN OUT: Incomplete State Reset
**File:** `public/index.html`
**Function:** Need to find `signOut` function

**Problem:** If sign out doesn't clear ALL global state (FID, FD, data, etc.), the next user on the same browser could briefly see the previous user's data before auth state updates.

**Impact:** HIGH - Data leakage between users on same browser

---

### 5. INVITE CLOUD FUNCTION: No Rate Limiting
**File:** `functions/index.js`
**Function:** `exports.createInvite` (Line 943)

```javascript
exports.createInvite = onCall({ cors: CORS_ORIGINS }, async (request) => {
  // ... no rate limit check ...
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  await db.collection('invitations').doc(code).set({...});
  return { code };
});
```

**Problem:**
- No check for existing active invites
- No rate limiting
- Can be called repeatedly

**Impact:** HIGH - Hundreds of duplicate invitations

---

## ROOT CAUSE ANALYSIS

### Why Phone Users See Other Users' Data

**Hypothesis 1: Shared Browser/Device**
- User A signs in → FID is set
- User A signs out → FID is NOT cleared
- User B (phone auth) signs in → No user doc exists
- App shows setup screen BUT FID is still in memory
- If User B accidentally triggers `loadAndSubscribe()`, it loads User A's family

**Hypothesis 2: LocalStorage Pollution**
- `LS.get('familyos_family_name')` or other cached values
- Previous user's data persists in localStorage
- New user inherits cached FID

**Hypothesis 3: Invite Link Confusion**
- User B clicked an invite link meant for someone else
- Joined User A's family
- Now permanently in User A's family

**Most Likely:** Hypothesis 1 or 3

---

### Why Hundreds of Invitations Were Created

**Root Cause:** No rate limiting in `openInviteModal` or `createInvite` Cloud Function

**Scenario:**
1. User clicks "Invite Member"
2. Modal opens, calls `createInvite` Cloud Function
3. User clicks again (impatient or UI lag)
4. Another invite created
5. Repeat 100 times → 100 invitations

**Fix:** Add rate limiting and deduplication

---

## SECURITY FIXES REQUIRED

### Priority 1: CRITICAL (Do First)
1. ✅ Add security check in `loadAndSubscribe()` - ALREADY DONE
2. ⏳ Fix sign out to clear ALL global state
3. ⏳ Add rate limiting to invite generation
4. ⏳ Update Firestore rules to use `memberUids` array

### Priority 2: HIGH (Do Next)
5. ⏳ Add `memberUids` field to family documents
6. ⏳ Update family creation to include `memberUids`
7. ⏳ Update invite join to update `memberUids`
8. ⏳ Add cleanup script to delete duplicate invitations

### Priority 3: MEDIUM (Do After)
9. ⏳ Add user document creation on first login
10. ⏳ Update lastLoginAt on every login
11. ⏳ Add admin role checks for invite generation
12. ⏳ Add invite expiration cleanup

---

## TESTING PLAN

### Test 1: Data Isolation
1. Sign in as User A
2. Note Family ID in console
3. Sign out
4. Sign in as User B (different phone/email)
5. Note Family ID in console
6. ✅ PASS: Family IDs are different
7. ✅ PASS: User B cannot see User A's data

### Test 2: Invite Rate Limiting
1. Sign in as family owner
2. Click "Invite Member" 10 times rapidly
3. ✅ PASS: Only 1-3 invitations created
4. ✅ PASS: Shows existing invite instead of creating new

### Test 3: Sign Out State Reset
1. Sign in as User A
2. Load app, see data
3. Sign out
4. Check console: FID, FD, data should all be null/empty
5. Sign in as User B
6. ✅ PASS: Sees only User B's data

---

## DEPLOYMENT CHECKLIST

After implementing fixes:
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Deploy hosting: `firebase deploy --only hosting`
- [ ] Deploy Cloud Functions: `firebase deploy --only functions`
- [ ] Run cleanup script to delete duplicate invitations
- [ ] Test with 2 different users on same browser
- [ ] Verify console logs show correct family isolation
- [ ] Verify invite rate limiting works

---

**Next Steps:** Implement all security fixes in order of priority.
