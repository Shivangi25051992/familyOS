# FamilyOS Mobile Sign-In Guide

## For Users Having Trouble Signing In (Especially iPhone Safari)

### The Problem
Some users experience a "redirect loop" where they:
1. Click "Continue with Google"
2. Complete Google sign-in
3. Get redirected back to the app
4. See the sign-in page again (loop)

### Why This Happens
- **Mobile browsers** (especially Safari on iPhone) handle OAuth redirects differently than desktop
- **In-app browsers** (WhatsApp, Instagram, Facebook) have security restrictions that block sign-in
- **PWA mode** has different behavior than regular browser mode

---

## ✅ RECOMMENDED SIGN-IN METHOD (iPhone/Android)

### Step 1: Open in Safari or Chrome
If you received the invite link via WhatsApp/Instagram/Facebook:
1. **Tap the link** to open it
2. **Look for the ⋮ menu** (three dots) in the top-right
3. **Select "Open in Safari"** or **"Open in Chrome"**
4. **Do NOT** try to sign in from within WhatsApp/Instagram browser

### Step 2: Sign In with Google
1. Tap **"Continue with Google"**
2. Choose your Google account
3. **Wait 2-3 seconds** after Google redirects you back
4. You should see either:
   - The join screen with your invite code pre-filled
   - The family setup screen (if no invite)
   - Your family dashboard (if already a member)

### Step 3: Join Your Family (First Time Only)
1. If you see the **join screen**, your invite code should be pre-filled
2. Tap **"Join Family Space →"**
3. Done! You're now part of the family space

---

## 🔧 TROUBLESHOOTING

### Issue: "Stuck on sign-in page after Google OAuth"

**Solution 1: Clear Cache**
1. Open Safari Settings
2. Scroll to "Safari" → "Clear History and Website Data"
3. Try signing in again

**Solution 2: Use Incognito/Private Mode**
1. Open Safari
2. Tap the tabs icon → "Private"
3. Visit the FamilyOS link
4. Sign in

**Solution 3: Try Chrome Instead**
1. Install Chrome from App Store (if not installed)
2. Open the invite link in Chrome
3. Sign in with Google

### Issue: "Sign-in button does nothing"

**Check:**
- Are you in WhatsApp/Instagram browser? → Open in Safari/Chrome
- Is your internet connection stable?
- Try refreshing the page

### Issue: "Can't find my invite code"

**Solution:**
1. Ask the person who invited you to resend the link
2. The link looks like: `https://familyos-e3d4b.web.app/?invite=ABC123`
3. The code is the 6 characters after `?invite=`

---

## 📱 PLATFORM-SPECIFIC TIPS

### iPhone (Safari)
- ✅ **Best experience**: Use Safari (not in-app browsers)
- ✅ Sign-in uses **redirect** (more reliable than popup)
- ⏱️ Wait 2-3 seconds after Google redirects you back
- 🔄 If stuck, try clearing Safari cache

### Android (Chrome)
- ✅ **Best experience**: Use Chrome
- ✅ Sign-in uses **redirect** on mobile
- ⏱️ Wait 2-3 seconds after Google redirects you back

### Desktop (Any Browser)
- ✅ Works with **popup** (faster)
- ✅ Chrome, Firefox, Safari, Edge all work well

---

## 🆘 STILL STUCK?

### Console Logs for Debugging
If you're tech-savvy, you can help us debug:

1. **Open Safari on iPhone:**
   - Connect iPhone to Mac
   - Open Safari on Mac → Develop → [Your iPhone] → [FamilyOS tab]
   - Check the Console for errors

2. **Open Chrome on Android:**
   - Go to `chrome://inspect` on desktop Chrome
   - Connect your Android device
   - Inspect the FamilyOS page
   - Check the Console for errors

### What to Look For:
- ❌ `permission-denied` errors
- ❌ `failed-precondition` errors
- ❌ `Redirect sign-in error` messages
- ✅ `✅ Redirect sign-in completed` (good!)
- ✅ `🎉 Invite code found in URL` (good!)

### Share These Details:
If you need help, share:
1. Your device (iPhone 15, Samsung Galaxy S23, etc.)
2. Your browser (Safari, Chrome, etc.)
3. Where you clicked the link (WhatsApp, Instagram, direct link)
4. Any error messages from the console

---

## 📋 QUICK CHECKLIST

Before contacting support, try:
- [ ] Open link in Safari/Chrome (not WhatsApp/Instagram)
- [ ] Clear browser cache
- [ ] Try incognito/private mode
- [ ] Wait 2-3 seconds after Google sign-in
- [ ] Check internet connection
- [ ] Try a different browser
- [ ] Restart your phone

---

## 🎯 WHAT WE FIXED

### Recent Improvements (March 2026)
1. ✅ **Always use redirect on mobile** (more reliable than popup)
2. ✅ **Increased auth delay** from 1.5s to 2s (gives time for user doc creation)
3. ✅ **Fallback invite detection** from URL params (in case localStorage cleared)
4. ✅ **Better error logging** for debugging mobile issues
5. ✅ **Auto-detect in-app browsers** and show helpful message
6. ✅ **Show "Completing sign-in..."** when returning from OAuth redirect
7. ✅ **Direct to join screen** if invite code present in URL

### Known Limitations
- ⚠️ In-app browsers (WhatsApp, Instagram) don't support OAuth → Must open in Safari/Chrome
- ⚠️ Some corporate/school networks block OAuth redirects
- ⚠️ Very old iOS versions (<14) may have issues

---

## 💡 FOR THE PERSON SENDING INVITES

### Best Practices:
1. **Include instructions** when sharing the link:
   ```
   Hey! Join our FamilyOS family space:
   https://familyos-e3d4b.web.app/?invite=ABC123
   
   📱 iPhone users: Open in Safari (not WhatsApp)
   🤖 Android users: Open in Chrome
   ```

2. **Test the link yourself** before sharing
3. **Check the invite code hasn't expired** (7 days default)
4. **Verify the recipient's email** if using email-based sharing

---

## 🔐 SECURITY NOTE

FamilyOS uses Google OAuth for authentication, which means:
- ✅ We never see your Google password
- ✅ You can revoke access anytime from your Google account
- ✅ All data is encrypted and private to your family
- ✅ Invitation-only access (no public sign-ups)

---

**Last Updated:** March 26, 2026
**Version:** 3.0
**Support:** Contact the person who invited you or check the app's troubleshooting section
