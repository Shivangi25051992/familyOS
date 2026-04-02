# Phone Number Support for Health Record Sharing

## Overview
You can now share health records using **phone numbers** in addition to email addresses and User IDs.

## What's New

### 1. Three Ways to Share Health Records
When sharing a health record with any FamilyOS user, you can now use:

1. **Email**: `user@example.com`
2. **Phone Number**: `+91 9876543210` (with country code)
3. **User ID**: `ABC123xyz...` (existing method)

### 2. Smart Phone Number Detection
- Automatically detects if input is a phone number
- Supports international format with country code (e.g., `+91 9876543210`)
- Auto-adds `+91` for Indian numbers if country code is missing
- Handles common formatting (spaces, dashes, parentheses are removed)

### 3. Updated UI
- Share modal now shows: **"Recipient Email, Phone, or User ID"**
- Chip button updated to: **"Any User (Email/Phone)"**
- Help text shows all three options with examples
- Placeholder: `email@example.com, +91 9876543210, or user ID`

## How It Works

### For Record Owners (Sharing)
1. Open a health record
2. Click **"🔗 Share"** button
3. Select **"Any User (Email/Phone)"** tab
4. Enter recipient's:
   - Email: `work.vanshtamsetwar@gmail.com`
   - Phone: `+91 9876543210` or `9876543210` (for India)
   - User ID: `HOwtxA8ApjcCxlmjIPNqx6rPdng2`
5. Select permissions (which tabs to share)
6. Click **"Share Record"**

### For Recipients
- Recipients must have signed up for FamilyOS using that phone number
- They will see the shared record in **"Shared With You"** section
- Phone auth users (signed up with OTP) can now receive shared records

## Technical Implementation

### Backend (Cloud Function)
- New `lookupUserByPhone` Cloud Function
- Queries Firestore `users` collection by `phoneNumber` field
- Returns user's UID, name, and email (if available)
- Validates phone format (must include country code)
- Secure: Requires authentication, admin-level access

### Frontend (Client-Side)
- Smart input detection: email vs phone vs UID
- Phone regex: `/^\+?\d{10,15}$/` (10-15 digits, optional +)
- Auto-normalizes phone: removes spaces, dashes, parentheses
- Auto-adds `+91` for Indian numbers without country code
- Comprehensive console logging for debugging

## Phone Number Format

### Supported Formats
✅ **Correct:**
- `+91 9876543210` (with country code, spaces OK)
- `+919876543210` (no spaces)
- `9876543210` (India only, auto-adds +91)

❌ **Incorrect:**
- `9876543210` (for non-India, needs country code)
- `(987) 654-3210` (US format not supported without +1)

### Country Code Examples
- India: `+91`
- USA: `+1`
- UK: `+44`
- UAE: `+971`
- Singapore: `+65`

## Testing Steps

### Test Case 1: Share with Phone Number
1. Sign up a test user with phone auth (OTP)
2. Note their phone number (e.g., `+91 9876543210`)
3. From your account, share a health record
4. Enter their phone number: `+91 9876543210`
5. Select permissions and share
6. ✅ Expected: "User found" → Share successful
7. Sign in as test user → See record in "Shared With You"

### Test Case 2: Share with Email (Existing)
1. Share a health record
2. Enter email: `work.vanshtamsetwar@gmail.com`
3. ✅ Expected: Still works as before

### Test Case 3: Invalid Phone
1. Share a health record
2. Enter invalid phone: `123` (too short)
3. ✅ Expected: "User not found" error

### Test Case 4: Phone Not Signed Up
1. Share a health record
2. Enter valid phone format but user doesn't exist: `+91 9999999999`
3. ✅ Expected: "User not found. Make sure they have a FamilyOS account with this phone."

## Console Logs

When sharing with phone number, you'll see:
```
═══════════════════════════════════════════════════
🔗 SHARING HEALTH RECORD
═══════════════════════════════════════════════════
Input: +91 9876543210
Input type: Phone Number
🔍 Looking up user by phone via Cloud Function...
Cloud Function response: {found: true, uid: 'ABC...', name: 'User Name', phoneNumber: '+919876543210'}
✅ User found: {uid: 'ABC...', name: 'User Name', phone: '+919876543210'}
```

## Firestore Data Structure

### Users Collection
When a user signs up with phone auth, their Firestore doc includes:
```javascript
{
  uid: "ABC123...",
  email: null,  // or email if they added it later
  phoneNumber: "+919876543210",
  name: "User Name",
  familyId: "XYZ...",
  role: "primary",
  createdAt: Timestamp
}
```

### Health Profile Sharing
When shared with phone user:
```javascript
{
  sharedWith: ["recipientUid"],
  shareDetails: [{
    uid: "recipientUid",
    name: "User Name",
    shareType: "email",  // or "family"
    permissions: { overview: true, reports: true, ... },
    sharedAt: Timestamp,
    expiresAt: Timestamp
  }]
}
```

## Benefits

1. **Easier Sharing**: Many users prefer phone over email
2. **Phone Auth Support**: Phone-only users can now receive shares
3. **India-Friendly**: Auto-adds +91 for convenience
4. **Flexible**: Email, phone, or UID all work
5. **Secure**: Cloud Function validates and looks up users

## Notes

- Phone number must match exactly as stored in Firestore
- Phone auth users must complete sign-up (OTP verification)
- If user signed up with Google but added phone later, both email and phone will work
- Country code is required for non-India numbers
- Sharing permissions work the same regardless of lookup method

## Deployment Status

✅ **Cloud Function**: `lookupUserByPhone` deployed to `us-central1`
✅ **Hosting**: Updated UI deployed to `familyos-e3d4b.web.app`
✅ **Git**: Changes committed to `claude/code-review-architecture-bGCXQ` branch

## Next Steps

1. Test phone sharing with a phone auth user
2. Verify console logs show correct detection
3. Confirm "Shared With You" section appears for recipient
4. Test edge cases (invalid phone, user not found)
5. Consider adding phone number to user profile display

---

**Ready to test!** 🚀

Try sharing a health record using a phone number and verify it works end-to-end.
