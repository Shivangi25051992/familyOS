# 🔓 Reset PIN/Passcode

You're being asked for a 4-digit PIN because you previously set up security on the app.

## Option 1: Reset PIN via Browser Console (Easiest)

1. **Open the app:** https://familyos-e3d4b.web.app
2. **Open browser console:** Press `F12` or right-click → Inspect → Console tab
3. **Paste this command and press Enter:**

```javascript
localStorage.removeItem('familyos_pin');
localStorage.removeItem('familyos_security');
localStorage.removeItem('familyos_session');
alert('PIN reset! Reload the page.');
```

4. **Reload the page:** Press `Ctrl+R` or `Cmd+R`
5. **Sign in again** - No PIN will be asked

---

## Option 2: Clear Browser Data

1. Open the app: https://familyos-e3d4b.web.app
2. Open browser settings (usually `Cmd+,` or `Ctrl+,`)
3. Go to Privacy → Clear Browsing Data
4. Select "Cookies and other site data"
5. Choose "Last hour" or "All time"
6. Clear data
7. Reload the app and sign in

---

## Option 3: Use Incognito/Private Window

1. Open a new Incognito/Private window
2. Go to: https://familyos-e3d4b.web.app
3. Sign in - No PIN will be asked
4. You can set a new PIN if you want

---

## What Happened?

The PIN is stored locally in your browser's localStorage. It's not stored in the database, so I can't retrieve it for you. But you can easily reset it using any of the methods above.

After resetting, you can:
- Use the app without a PIN
- Set a new PIN in Settings → Security

---

## Quick Fix (Copy-Paste)

**Just copy this entire block and paste it in the browser console:**

```javascript
// Reset PIN and security settings
localStorage.removeItem('familyos_pin');
localStorage.removeItem('familyos_security');
localStorage.removeItem('familyos_session');
console.log('✅ PIN reset successfully!');
console.log('🔄 Please reload the page (Ctrl+R or Cmd+R)');
alert('PIN reset! Reload the page to sign in.');
```

Then reload the page and sign in normally.
