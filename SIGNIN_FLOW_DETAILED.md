# FamilyOS Sign-In Flow - Complete Technical Documentation

**Last Updated:** March 26, 2026  
**Version:** 3.0.2  
**Status:** Production with Enhanced Monitoring

---

## 📊 Complete Sign-In Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER OPENS FAMILYOS APP                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 1: INITIAL PAGE LOAD                           │
│  - Show loading screen (scr-loading)                             │
│  - Initialize Firebase Auth                                      │
│  - Check for pending invite in URL (?invite=ABC123)              │
│  - Store invite in localStorage if present                       │
│  - Set 3-second timeout to show login if auth doesn't complete   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│         STEP 2: FIREBASE AUTH STATE CHECK                        │
│  onAuthStateChanged() fires                                      │
│  - If user = null → Show login screen (scr-login)                │
│  - If user exists → Proceed to Step 3                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
              ┌────────┴────────┐
              │                 │
         User Exists?       User = null
              │                 │
              ▼                 ▼
    ┌──────────────────┐  ┌──────────────────┐
    │   STEP 3:        │  │   SHOW LOGIN     │
    │   HANDLE AUTH    │  │   SCREEN         │
    │   (see below)    │  │                  │
    └──────────────────┘  └──────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │ USER CLICKS      │
                          │ "CONTINUE WITH   │
                          │ GOOGLE"          │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌────────┴────────┐
                          │                 │
                     Desktop?           Mobile?
                          │                 │
                          ▼                 ▼
              ┌──────────────────┐  ┌──────────────────┐
              │ signInWithPopup  │  │signInWithRedirect│
              │                  │  │                  │
              │ - Opens popup    │  │ - Redirects to   │
              │ - User signs in  │  │   Google OAuth   │
              │ - Popup closes   │  │ - User signs in  │
              │ - Returns user   │  │ - Redirects back │
              │                  │  │   with ?code=... │
              └────────┬─────────┘  └────────┬─────────┘
                       │                     │
                       └──────────┬──────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ STEP 3: HANDLE   │
                        │ AUTHENTICATED    │
                        │ USER             │
                        └────────┬─────────┘
                                 │
                                 ▼
```

---

## 🔍 STEP 3: Handle Authenticated User (Detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│  onAuthStateChanged(auth, async user => {                        │
│    if (user) {                                                   │
│      // User is signed in                                        │
│    }                                                             │
│  })                                                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3.1: Handle Redirect Result (Mobile Only)                 │
│  - Call getRedirectResult(auth)                                  │
│  - If redirectResult exists:                                     │
│    ✅ Log: "Redirect sign-in completed"                          │
│    ✅ Check URL for OAuth params (?code=, ?state=)               │
│    ✅ If present: CLEAN THEM (window.history.replaceState)       │
│    ✅ Wait 2 seconds for user doc creation                       │
│  - If no redirectResult: Normal flow (desktop or already handled)│
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3.2: Check for Pending Invite                             │
│  - Check localStorage for 'pending_invite'                       │
│  - Also check URL params for ?invite= (fallback)                 │
│  - If invite found:                                              │
│    → Show join screen (scr-join)                                 │
│    → Pre-fill invite code                                        │
│    → EXIT (user will join family)                                │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3.3: Fetch User Document from Firestore                   │
│  - Path: users/{uid}                                             │
│  - Try to fetch document                                         │
│  - If permission-denied: Wait 2s and retry                       │
│  - Log result: exists or not                                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
              ┌────────┴────────┐
              │                 │
      User Doc Exists?    User Doc Missing?
      Has familyId?       OR No familyId?
              │                 │
              ▼                 ▼
┌──────────────────────┐  ┌──────────────────────┐
│ STEP 3.4A:           │  │ STEP 3.4B:           │
│ LOAD EXISTING USER   │  │ NEW USER SETUP       │
│                      │  │                      │
│ - Set FID (familyId) │  │ - Check URL for      │
│ - Set myRole         │  │   invite code        │
│ - Check security:    │  │ - If invite:         │
│   • PIN/biometric?   │  │   → Show join screen │
│   • Session valid?   │  │ - If no invite:      │
│ - If locked:         │  │   → Show setup screen│
│   → Show PIN screen  │  │                      │
│ - If unlocked:       │  │ User must either:    │
│   → Load app data    │  │ 1. Join with code    │
│   → Show dashboard   │  │ 2. Create new family │
└──────────────────────┘  └──────────────────────┘
```

---

## 🔐 Authentication Methods

### Desktop (Popup Flow)

```javascript
// Triggered when user clicks "Continue with Google" on desktop
async function signInWithGoogle() {
  // Check: Is mobile?
  const usePopup = !isMobile(); // true on desktop
  
  if (usePopup) {
    // Desktop: Use popup
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    // Popup closes, user object returned immediately
    // onAuthStateChanged fires with user
    // No URL modification
  }
}
```

**Characteristics:**
- ✅ Fast (no page reload)
- ✅ Clean URL (no OAuth params)
- ✅ Better UX
- ❌ Can be blocked by popup blockers
- ✅ Works reliably on desktop

### Mobile (Redirect Flow)

```javascript
// Triggered when user clicks "Continue with Google" on mobile
async function signInWithGoogle() {
  const usePopup = !isMobile(); // false on mobile
  
  if (!usePopup) {
    // Mobile: Use redirect
    await signInWithRedirect(auth, new GoogleAuthProvider());
    // Browser redirects to Google
    // User authenticates
    // Google redirects back to app with OAuth params
    // Page reloads
    // onAuthStateChanged fires
    // getRedirectResult() returns user
  }
}
```

**Characteristics:**
- ✅ Reliable on mobile (no popup issues)
- ⚠️ Modifies URL (adds ?code=, ?state=)
- ⚠️ Requires page reload
- ✅ Works in all mobile browsers
- ⚠️ Needs OAuth param cleanup to prevent loops

---

## 🧹 Critical: OAuth Parameter Cleanup

### The Problem

When using `signInWithRedirect()`, Google adds OAuth parameters to the URL:

```
Before: https://familyos-e3d4b.web.app/
After:  https://familyos-e3d4b.web.app/?code=ABC123&state=XYZ789&scope=...
```

Firebase Auth SDK **continuously monitors** the URL for these parameters. If it finds them, it assumes a redirect is in progress and triggers `getRedirectResult()` again, creating an infinite loop.

### The Solution

```javascript
// After handling redirect result
const redirectResult = await getRedirectResult(auth);
if (redirectResult) {
  // User signed in successfully
  
  // CRITICAL: Clean OAuth params from URL
  const url = new URL(window.location.href);
  if (url.searchParams.has('code') || url.searchParams.has('state')) {
    // Remove all OAuth params
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('scope');
    url.searchParams.delete('authuser');
    url.searchParams.delete('prompt');
    
    // Update URL without reloading page
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    
    // Now Firebase Auth won't trigger another redirect
  }
}
```

**Why This Works:**
- `window.history.replaceState()` modifies the URL without reloading
- Firebase Auth no longer sees OAuth params
- No more automatic redirect triggers
- User flow completes successfully

---

## 📝 Firestore Data Structure

### User Document

```
Collection: users
Document ID: {uid}
Fields:
  - email: string
  - name: string
  - familyId: string (reference to family)
  - role: "primary" | "secondary"
  - createdAt: timestamp
```

### Family Document

```
Collection: families
Document ID: {auto-generated}
Fields:
  - name: string
  - primaryName: string
  - secondaryName: string
  - members: array of uids
  - modules: array of enabled modules
  - createdAt: timestamp
```

---

## 🔍 Monitoring & Diagnostics

### AppMonitor System

The app includes a built-in crash reporting and action failure logging system:

```javascript
// Capture events
AppMonitor.capture('event_name', 'description', { data });

// Log failures
AppMonitor.logFailure('action_name', 'error message', errorObject);
```

**Events Tracked:**
- `auth_redirect_success` - User signed in via redirect
- `auth_url_cleaned` - OAuth params removed from URL
- `auth_user_doc_found` - User document exists in Firestore
- `auth_user_doc_missing` - User document not found (new user)
- `auth_permission_denied_retry` - Permission denied, retrying
- `auth_loading_app` - User has family, loading app
- `auth_needs_setup` - User needs setup or invite
- `auth_showing_join` - Showing join screen with invite
- `auth_showing_setup` - Showing setup screen (no invite)

**Failures Tracked:**
- `auth_redirect` - Redirect sign-in error
- `auth_user_doc_fetch` - Error fetching user document
- `auth_flow` - General auth flow error

### User-Accessible Diagnostics

Users can run this in the browser console:

```javascript
getAuthDiagnostics()
```

This will:
1. Collect comprehensive diagnostic info
2. Display it in the console
3. Copy it to clipboard
4. User can paste and send to support

**Information Collected:**
- Device type (mobile/desktop, browser, OS)
- Auth state (signed in, UID, email)
- App state (family ID, role)
- URL parameters (invite code, OAuth params)
- Current screen
- LocalStorage state
- Timestamp and full URL

---

## 🐛 Common Issues & Solutions

### Issue 1: Redirect Loop on Mobile

**Symptoms:**
- User clicks "Continue with Google"
- Completes OAuth
- Returns to app
- Sees "Continue with Google" again
- Loop repeats

**Root Cause:**
- OAuth params not cleaned from URL
- Firebase Auth keeps triggering redirects

**Solution:**
- ✅ **FIXED** in v3.0.2
- OAuth params are now automatically cleaned
- See "OAuth Parameter Cleanup" section above

**How to Verify:**
```javascript
// Console logs should show:
✅ Redirect sign-in completed: user@example.com
🧹 Cleaning OAuth params from URL to prevent redirect loop
✅ URL cleaned: https://familyos-e3d4b.web.app/
```

---

### Issue 2: User Signed In But Sees Login Screen

**Symptoms:**
- User completes Google OAuth
- Auth succeeds
- But still sees login screen or loading screen

**Possible Causes:**

**A. User Document Not Created Yet**
```javascript
// Check console logs:
📄 User doc exists: false
```

**Solution:**
- Wait 2-3 seconds (automatic delay built in)
- User doc should be created by Firebase Auth
- If still missing after 5 seconds, there's a deeper issue

**B. Permission Denied Error**
```javascript
// Check console logs:
❌ Error fetching user document: FirebaseError: permission-denied
```

**Solution:**
- Check Firestore security rules
- Ensure user can read their own document:
  ```
  match /users/{userId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  ```

**C. Network Error**
```javascript
// Check console logs:
❌ Error fetching user document: FirebaseError: unavailable
```

**Solution:**
- Check internet connection
- Check Firebase project status
- Try again

---

### Issue 3: Invite Code Not Working

**Symptoms:**
- User clicks invite link with ?invite=ABC123
- Signs in with Google
- But doesn't see join screen

**Possible Causes:**

**A. Invite Code Lost During Redirect**
```javascript
// Check console logs:
📊 Invite param: none
```

**Solution:**
- ✅ **FIXED** in v3.0.2
- Invite code is now checked multiple times:
  1. On initial page load (stored in localStorage)
  2. After redirect (checked in URL again)
  3. When determining which screen to show

**B. Invite Code Expired or Used**
```javascript
// Check Firestore:
invitations/{code}
  - used: true (already used)
  - expires: < Date.now() (expired)
```

**Solution:**
- Generate new invite code
- Check expiration time (default 7 days)

---

### Issue 4: In-App Browser Issues

**Symptoms:**
- User clicks link from WhatsApp/Instagram
- Sign-in button doesn't work
- Or redirects fail

**Root Cause:**
- In-app browsers (WhatsApp, Instagram, Facebook) block OAuth for security

**Solution:**
- ✅ **DETECTED** automatically
- App shows message: "Open in Chrome or Safari for sign-in"
- User must tap ⋮ menu → "Open in Safari/Chrome"

**How to Verify:**
```javascript
// Console logs should show:
⚠️ In-app browser detected
```

---

## 📊 Console Logging Guide

### Normal Sign-In Flow (Mobile with Invite)

```
═══════════════════════════════════════════════════
🔐 GOOGLE SIGN-IN INITIATED
═══════════════════════════════════════════════════
Sign-in method: Redirect
Is PWA: false
Is Mobile: true
🔄 Using redirect sign-in (Mobile)...
💡 This is more reliable on mobile devices

[User completes Google OAuth]
[Page redirects back]

═══════════════════════════════════════════════════
🔐 AUTH STATE CHANGED - User signed in
═══════════════════════════════════════════════════
User: John Doe
User ID: ABC123XYZ789
Email: john@example.com
═══════════════════════════════════════════════════

🔄 Step 1: Checking for redirect result...
🔄 Step 2: getRedirectResult returned: User object
✅ Redirect sign-in completed: john@example.com
📊 User details: {uid: "ABC123", email: "john@example.com", ...}
🔄 Step 3: Checking URL for OAuth params...
📊 OAuth params present: true
🧹 Cleaning OAuth params from URL to prevent redirect loop
✅ URL cleaned
   Before: https://familyos-e3d4b.web.app/?invite=XYZ123&code=...
   After: https://familyos-e3d4b.web.app/?invite=XYZ123
🔄 Step 4: Refreshing auth token and waiting 2s...
✅ Step 4: Token refreshed, proceeding to user doc check

📋 Checking for pending invite: XYZ123
✅ Found pending invite, showing join screen
💡 User should see join screen with pre-filled code: XYZ123
✅ Join screen displayed with pre-filled invite code
```

### Normal Sign-In Flow (Desktop, No Invite, New User)

```
═══════════════════════════════════════════════════
🔐 GOOGLE SIGN-IN INITIATED
═══════════════════════════════════════════════════
Sign-in method: Popup
Is PWA: false
Is Mobile: false
🔄 Attempting popup sign-in (Desktop)...
✅ Popup sign-in successful
User: jane@example.com

═══════════════════════════════════════════════════
🔐 AUTH STATE CHANGED - User signed in
═══════════════════════════════════════════════════
User: Jane Smith
User ID: DEF456GHI789
Email: jane@example.com
═══════════════════════════════════════════════════

🔄 Step 1: Checking for redirect result...
🔄 Step 2: getRedirectResult returned: null
ℹ️ No redirect result (normal for popup flow or already handled)

📋 Checking for pending invite: None

🔄 Step 5: Checking user document...
📊 User ID: DEF456GHI789
📊 Firestore path: users/DEF456GHI789
🔄 Fetching user document from Firestore...
✅ Step 5: User doc fetch complete
📄 User doc exists: false
⚠️ User document does NOT exist (new user)

🔄 Step 6: Determining which screen to show...
🔄 Step 6: User needs setup (no family)
❌ User doc missing or no familyId
💡 User needs to either:
   1. Create a new family (setup screen)
   2. Join with invite code (join screen)
📊 Checking URL for invite code...
📊 Current URL: https://familyos-e3d4b.web.app/
📊 Invite param: none
📝 No invite found, showing setup screen
✅ Setup screen displayed
```

---

## 🔧 Troubleshooting Commands

### For Users

Run these in the browser console:

```javascript
// Get comprehensive diagnostics
getAuthDiagnostics()

// Copy your User ID
copyMyUserId()

// Show sharing instructions
howToShare()

// Check current auth state
console.log('Signed in:', !!CU);
console.log('User:', CU);
console.log('Family ID:', FID);
console.log('Role:', myRole);

// Check current screen
console.log('Active screen:', document.querySelector('.screen.active')?.id);

// Check URL params
console.log('URL:', window.location.href);
console.log('Invite code:', new URLSearchParams(window.location.search).get('invite'));
```

### For Developers

```javascript
// Check AppMonitor logs
console.log('Crash logs:', LS.get('_fos_crash'));

// Force show specific screen
showScreen('scr-login');   // Login
showScreen('scr-join');    // Join with invite
showScreen('scr-setup');   // Setup new family
showScreen('scr-app');     // Main app

// Check Firestore connection
getDoc(doc(db, 'users', CU.uid)).then(d => console.log('User doc:', d.data()));

// Test sign-in flow
signInWithGoogle();
```

---

## 📈 Success Metrics

**Target:**
- ✅ 100% of users can sign in successfully
- ✅ Zero redirect loop reports
- ✅ Auth completes within 5 seconds
- ✅ Clear error messages for any failures

**Monitoring:**
- AppMonitor events (stored in localStorage)
- Console logs from user reports
- User-submitted diagnostics via `getAuthDiagnostics()`

---

## 🚀 Recent Improvements (v3.0.2)

1. **Comprehensive Logging**
   - Every step of auth flow is logged
   - Clear step numbers (Step 1, Step 2, etc.)
   - Detailed information at each checkpoint

2. **User-Visible Diagnostics**
   - `getAuthDiagnostics()` function
   - "Copy Diagnostics for Support" button on login screen
   - Automatic clipboard copy

3. **Enhanced Error Messages**
   - User-friendly error toasts
   - Specific messages for different error types
   - Guidance on what to do next

4. **AppMonitor Integration**
   - All auth events tracked
   - Failures logged with context
   - Stored locally for later review

5. **OAuth Param Cleanup**
   - Automatic removal after redirect
   - Prevents infinite loops
   - Preserves invite code in URL

---

## 📞 Support Workflow

### When User Reports Sign-In Issue

1. **Ask user to run:**
   ```javascript
   getAuthDiagnostics()
   ```

2. **User copies output and sends to you**

3. **You analyze:**
   - Device type (mobile/desktop)
   - Auth state (signed in or not)
   - Current screen
   - URL parameters
   - Error messages

4. **Common patterns:**
   - `activeScreen: "scr-login"` + `isSignedIn: true` → User doc issue
   - `hasOAuthCode: true` → OAuth params not cleaned (should be fixed)
   - `isInAppBrowser: true` → User needs to open in real browser
   - `hasFamilyId: false` → User needs setup or invite

---

**Document Version:** 2.0  
**Last Updated:** March 26, 2026  
**Status:** Production with Enhanced Monitoring
