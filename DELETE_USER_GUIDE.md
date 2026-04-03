# How to Delete User Account

## Friend's Phone Number
**Phone:** +91 81694 55340
**Normalized:** +918169455340

## IMPORTANT: Two-Step Process

You need to delete from TWO places:
1. **Firestore** (user data)
2. **Firebase Authentication** (login credentials)

---

## STEP 1: Delete from Firestore

### A. Find and Delete User Document

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/users
2. Browse through the `users` collection
3. Find the document where `phoneNumber` = `+918169455340`
4. **Note the document ID** (this is her UID) - you'll need it for Step 2
5. Click on the document
6. Click the **trash icon** (🗑️) at the top
7. Confirm deletion

### B. Remove from Your Family (If Present)

**Before deleting, check if she's in your family:**

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/families
2. Find YOUR family document
3. Click on it
4. Check the `members` array
5. **If her UID is present:**
   - Click "Edit Document"
   - Remove her UID from the `members` array
   - Find the `memberProfiles` object
   - Delete her entry (the key with her UID)
   - Click "Update"

---

## STEP 2: Delete from Firebase Authentication

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/authentication/users
2. Look for user with phone number `+91 81694 55340`
3. Click on the user row
4. Click **"Delete user"** button (top right)
5. Confirm deletion

**Alternative way to find her:**
- Use the search box at the top
- Search for: `8169455340`
- This will filter to her account

---

## STEP 3: Verify Deletion

### Check Firestore
1. Go back to: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/users
2. Search for her phone number
3. Should return no results

### Check Authentication
1. Go back to: https://console.firebase.google.com/project/familyos-e3d4b/authentication/users
2. Search for her phone number
3. Should return no results

---

## What Happens After Deletion

**For her:**
- She will be signed out immediately
- Cannot sign in with that phone number anymore
- All her data is deleted
- She can sign up again with the same phone number (will be a fresh account)

**For you:**
- If she was in your family, she's now removed
- Your data remains intact
- No impact on your account

---

## If You Want Her to Sign Up Again (Fresh Start)

After deletion:
1. Ask her to:
   - Open FamilyOS: https://familyos-e3d4b.web.app
   - Sign in with phone number: +91 81694 55340
   - Enter OTP
   - Complete setup (create her own family)
   - She will have a completely fresh account

---

## Alternative: Just Remove from Your Family (Don't Delete)

If you want to keep her account but just remove her from your family:

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/families
2. Find YOUR family document
3. Click "Edit Document"
4. Remove her UID from `members` array
5. Delete her entry from `memberProfiles` object
6. Click "Update"

Then:
1. Go to her user document: `users/{her-uid}`
2. Click "Edit Document"
3. Delete the `familyId` field
4. Click "Update"

**Result:**
- She's removed from your family
- Her account still exists
- She'll see setup screen next time she logs in
- She can create her own family

---

## Recommended Approach

**I recommend Option 2 (Remove from family, don't delete):**

**Why?**
- Safer (no permanent deletion)
- She keeps her phone number
- She can create her own family
- Easier to recover if something goes wrong

**Steps:**
1. Remove her UID from your family's `members` array
2. Delete her entry from your family's `memberProfiles`
3. Delete `familyId` field from her user document
4. Ask her to refresh the page
5. She'll see setup screen
6. She creates her own family

---

## Quick Reference

**Her Phone:** +918169455340

**Firestore Console:**
- Users: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/users
- Families: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/families

**Authentication Console:**
- Users: https://console.firebase.google.com/project/familyos-e3d4b/authentication/users

---

## Need Help?

If you're not comfortable doing this, you can:
1. Share screenshots of her user document
2. Share screenshots of your family document
3. I'll tell you exactly which fields to edit/delete

**IMPORTANT:** Make sure you're deleting/editing the RIGHT documents!
- Double-check the phone number
- Double-check the UID
- Don't accidentally delete your own account!
