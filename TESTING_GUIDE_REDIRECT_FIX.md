# Testing Guide: Mobile Redirect Loop Fix

## 🎯 What Was Fixed

**Issue:** New users on mobile Chrome/Safari got stuck in an infinite redirect loop after signing in with Google.

**Root Cause:** OAuth parameters (`?code=`, `?state=`) remained in the URL after redirect, causing Firebase Auth to trigger continuous redirects.

**Fix:** Automatically clean OAuth parameters from URL after handling redirect result.

---

## ✅ How to Test (Mobile Chrome/Safari)

### Test Case 1: New User Sign-Up (No Invite)

**Steps:**
1. Open **mobile Chrome** or **Safari**
2. Clear browser data (Settings → Privacy → Clear browsing data)
3. Visit: https://familyos-e3d4b.web.app/
4. Click **"Continue with Google"**
5. Choose a **NEW Google account** (one that hasn't used FamilyOS before)
6. Complete Google OAuth
7. Wait for redirect back to app

**Expected Result:**
- ✅ You should see the **setup screen** (Step 01 · Identity)
- ✅ URL should be clean: `https://familyos-e3d4b.web.app/` (no `?code=` or `?state=`)
- ✅ No further redirects
- ✅ No "Continue with Google" button loop

**Console Logs to Verify:**
```
✅ Redirect sign-in completed: user@example.com
🧹 Cleaning OAuth params from URL to prevent redirect loop
✅ URL cleaned: https://familyos-e3d4b.web.app/
📄 User doc exists: false
📝 No invite found, showing setup screen
```

**If It Fails:**
- ❌ You see "Continue with Google" again → Bug still present
- ❌ URL still has `?code=` or `?state=` → Params not cleaned
- ❌ Console shows redirect errors → Check logs

---

### Test Case 2: New User with Invite Code

**Steps:**
1. Open **mobile Chrome** or **Safari**
2. Clear browser data
3. Get an invite link (e.g., `https://familyos-e3d4b.web.app/?invite=ABC123`)
4. Click the invite link
5. Click **"Continue with Google"**
6. Choose a **NEW Google account**
7. Complete Google OAuth
8. Wait for redirect back to app

**Expected Result:**
- ✅ You should see the **join screen** with invite code pre-filled
- ✅ URL should be: `https://familyos-e3d4b.web.app/?invite=ABC123` (OAuth params removed, invite param preserved)
- ✅ Invite code is pre-filled in the input field
- ✅ No further redirects

**Console Logs to Verify:**
```
✅ Redirect sign-in completed: user@example.com
🧹 Cleaning OAuth params from URL to prevent redirect loop
✅ URL cleaned: https://familyos-e3d4b.web.app/?invite=ABC123
🎉 Invite code found in URL, showing join screen
```

---

### Test Case 3: Existing User Sign-In

**Steps:**
1. Open **mobile Chrome** or **Safari**
2. Clear browser data (to force sign-in)
3. Visit: https://familyos-e3d4b.web.app/
4. Click **"Continue with Google"**
5. Choose an **EXISTING Google account** (one that already used FamilyOS)
6. Complete Google OAuth
7. Wait for redirect back to app

**Expected Result:**
- ✅ You should see your **family dashboard** (Home screen)
- ✅ URL should be clean: `https://familyos-e3d4b.web.app/`
- ✅ No setup screen (you already have a family)
- ✅ No further redirects

**Console Logs to Verify:**
```
✅ Redirect sign-in completed: user@example.com
🧹 Cleaning OAuth params from URL to prevent redirect loop
✅ URL cleaned: https://familyos-e3d4b.web.app/
📄 User doc exists: true
✅ User has family: [family-id]
🚀 Loading family data...
```

---

### Test Case 4: Desktop Browser (Baseline)

**Steps:**
1. Open **desktop Chrome**
2. Clear browser data
3. Visit: https://familyos-e3d4b.web.app/
4. Click **"Continue with Google"**
5. Choose a **NEW Google account**
6. Complete Google OAuth in popup

**Expected Result:**
- ✅ You should see the **setup screen** immediately
- ✅ URL should be clean (no OAuth params, because popup was used)
- ✅ No redirects (popup flow)

**Console Logs to Verify:**
```
Sign-in method: Popup
🔄 Attempting popup sign-in (Desktop)...
✅ Popup sign-in successful
User: user@example.com
```

---

## 🔍 Debugging Tips

### Check Console Logs

Open browser console (mobile Chrome: `chrome://inspect` on desktop, Safari: Web Inspector):

**Good Signs:**
- ✅ `✅ Redirect sign-in completed`
- ✅ `🧹 Cleaning OAuth params from URL`
- ✅ `✅ URL cleaned`
- ✅ `📝 No invite found, showing setup screen`

**Bad Signs:**
- ❌ No "URL cleaned" message → Fix not working
- ❌ Multiple "Redirect sign-in completed" messages → Loop still happening
- ❌ `permission-denied` errors → Different issue (Firestore rules)

### Check URL

After redirect, check the URL in the address bar:

**Good:**
- ✅ `https://familyos-e3d4b.web.app/` (clean)
- ✅ `https://familyos-e3d4b.web.app/?invite=ABC123` (only invite param)

**Bad:**
- ❌ `https://familyos-e3d4b.web.app/?code=...&state=...` (OAuth params still present)

### Check Network Tab

If you see continuous redirects:
1. Open Network tab in browser console
2. Look for repeated requests to Google OAuth
3. If you see multiple OAuth requests → Loop still happening

---

## 📱 Platform-Specific Notes

### iPhone Safari
- Uses `signInWithRedirect()` (popup unreliable on iOS)
- OAuth params are cleaned after redirect
- May take 2-3 seconds to complete auth flow

### Android Chrome
- Uses `signInWithRedirect()` (popup unreliable on mobile)
- OAuth params are cleaned after redirect
- Slightly faster than iOS (1-2 seconds)

### Desktop Chrome/Firefox/Safari
- Uses `signInWithPopup()` (faster, better UX)
- No OAuth params in URL (popup doesn't modify main window URL)
- Instant completion

---

## 🐛 Known Issues

### Issue: "Sign-in already in progress"
- **Cause:** User clicked "Continue with Google" multiple times
- **Fix:** Wait for first attempt to complete
- **Prevention:** Button is now disabled during sign-in

### Issue: "permission-denied" error
- **Cause:** Firestore rules (different issue)
- **Fix:** Already fixed separately
- **Not related to redirect loop**

### Issue: In-app browser (WhatsApp/Instagram)
- **Cause:** In-app browsers block OAuth
- **Fix:** App detects and shows message to open in Safari/Chrome
- **Not related to redirect loop**

---

## ✅ Success Criteria

The fix is working if:
1. ✅ New mobile users can sign up without loops
2. ✅ Setup screen appears within 3 seconds
3. ✅ URL is clean (no OAuth params)
4. ✅ Console logs show "URL cleaned"
5. ✅ No repeated redirect attempts

---

## 📞 Reporting Issues

If the fix doesn't work:

1. **Capture console logs:**
   - Mobile Chrome: Use `chrome://inspect` on desktop
   - Safari: Use Web Inspector on Mac

2. **Note the exact URL:**
   - Copy the full URL from address bar
   - Include all parameters

3. **Share these details:**
   - Device (iPhone 15, Samsung Galaxy S23, etc.)
   - Browser (Chrome 120, Safari 17, etc.)
   - Account type (new vs existing)
   - Whether invite code was used

4. **Include screenshots:**
   - The screen you're stuck on
   - Console logs
   - Network tab (if possible)

---

## 🎉 Expected Outcome

After this fix:
- **100% of mobile users** should be able to sign up successfully
- **Zero redirect loop reports**
- **Smooth onboarding experience**

---

**Last Updated:** March 26, 2026  
**Fix Version:** 3.0.1  
**Status:** ✅ Deployed to Production
