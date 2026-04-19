# 🧪 SECURITY TESTING GUIDE - FamilyOS

## CRITICAL: Test Multi-User Data Isolation

This guide will help you verify that the security fixes are working correctly.

---

## TEST 1: Data Isolation Between Users

### Objective
Verify that User A cannot see User B's data, and vice versa.

### Steps
1. **Sign in as User A**
   - Open https://familyos-e3d4b.web.app
   - Sign in with your primary account (prashantchintanwar@gmail.com)
   - Open browser console (F12)
   - Note the Family ID in console logs (look for "Family ID (FID): ...")
   - Navigate through app, see your data

2. **Sign out**
   - Click Settings → Sign Out
   - Verify console shows: "✅ SIGN OUT COMPLETE - State fully reset"
   - Verify all global variables are null (check console)

3. **Sign in as User B**
   - Use a different phone number or email
   - Sign in via phone/OTP or Google
   - Open browser console
   - Note the Family ID (should be DIFFERENT from User A)
   - Verify you see ONLY User B's data (or setup screen if new user)

### Expected Results
✅ User A's Family ID ≠ User B's Family ID  
✅ User B cannot see User A's data  
✅ Console shows "State fully reset" on sign out  
✅ No errors in console  

### If Test Fails
❌ Check console for "SECURITY CHECK" errors  
❌ Verify Firestore rules deployed (Firebase Console → Firestore → Rules)  
❌ Check user document in Firestore has correct `familyId`  

---

## TEST 2: Invite Rate Limiting

### Objective
Verify that only 3 active invites can exist at once.

### Steps
1. **Sign in as family owner**
   - Use your primary account
   - Go to Settings → Invite Member

2. **Create multiple invites**
   - Click "Invite Member" button
   - Note the invite code
   - Close modal
   - Click "Invite Member" again (repeat 5 times)

3. **Check results**
   - Open Firebase Console → Firestore → invitations collection
   - Count active invites for your family (where `used: false`)
   - Should see max 3 invitations

### Expected Results
✅ Max 3 active invitations exist  
✅ Toast shows "Using existing invite (max 3 active at once)"  
✅ Same invite code returned after 3rd attempt  

### If Test Fails
❌ Check Cloud Functions logs (Firebase Console → Functions)  
❌ Verify createInvite function deployed correctly  
❌ Check console for rate limit messages  

---

## TEST 3: Non-Owner Cannot Create Invite

### Objective
Verify that only the family owner can create invites.

### Steps
1. **Create a secondary member**
   - Sign in as owner
   - Create an invite
   - Sign out
   - Sign in with different account
   - Join family with invite code

2. **Try to create invite as secondary member**
   - Go to Settings → Invite Member
   - Click "Invite Member"

### Expected Results
✅ Error toast: "Only the family owner can create invites"  
✅ No invite created  
✅ Console shows error message  

### If Test Fails
❌ Check Cloud Functions logs  
❌ Verify createInvite function has owner check  
❌ Check family document `primaryOwner` field  

---

## TEST 4: Phone Auth User Isolation

### Objective
Verify phone auth users are properly isolated.

### Steps
1. **Create first phone user**
   - Sign out completely
   - Sign up with phone number (e.g., +91 9876543210)
   - Complete setup, create family "Family A"
   - Note Family ID in console

2. **Create second phone user**
   - Sign out
   - Sign up with different phone number (e.g., +91 8765432109)
   - Complete setup, create family "Family B"
   - Note Family ID in console

3. **Verify isolation**
   - Family A ID ≠ Family B ID
   - User 1 cannot see User 2's data
   - User 2 cannot see User 1's data

### Expected Results
✅ Different Family IDs  
✅ Complete data isolation  
✅ No "SECURITY CHECK" errors in console  

### If Test Fails
❌ Check user documents in Firestore (verify correct `familyId`)  
❌ Check family documents (verify correct `memberUids`)  
❌ Run cleanup script to reset database  

---

## TEST 5: Sign Out State Reset

### Objective
Verify that sign out clears ALL global state.

### Steps
1. **Sign in and load data**
   - Sign in with any account
   - Navigate through app
   - Open console, check global variables (FID, FD, data)

2. **Sign out**
   - Click Settings → Sign Out
   - Check console immediately

3. **Verify state cleared**
   - Look for "🚪 SIGNING OUT" message
   - Verify "✅ All global state cleared"
   - Verify "✅ SIGN OUT COMPLETE - State fully reset"

### Expected Results
✅ Console shows complete sign out flow  
✅ All global variables set to null/empty  
✅ Session storage cleared  
✅ Page reloads to login screen  

### If Test Fails
❌ Check doSignOut() function in index.html  
❌ Verify all unsubs are called  
❌ Check for JavaScript errors in console  

---

## QUICK DIAGNOSTIC COMMANDS

Open browser console and run these commands to check state:

### Check Current User & Family
```javascript
console.log('User ID:', CU?.uid);
console.log('Family ID:', FID);
console.log('Role:', myRole);
console.log('Family Data:', FD);
```

### Check Family Members
```javascript
console.log('Members:', FD?.members);
console.log('Member UIDs:', FD?.memberUids);
console.log('Member Profiles:', Object.keys(FD?.memberProfiles || {}));
```

### Check Data Loaded
```javascript
console.log('Health Profiles:', data.healthProfiles?.length);
console.log('Expenses:', data.expenses?.length);
console.log('Tasks:', data.tasks?.length);
```

### Verify State Cleared (after sign out)
```javascript
console.log('CU:', CU); // should be null
console.log('FID:', FID); // should be null
console.log('FD:', FD); // should be null
console.log('data:', data); // should be empty arrays
```

---

## FIREBASE CONSOLE CHECKS

### Verify Firestore Rules Deployed
1. Go to Firebase Console → Firestore → Rules
2. Check "Last updated" timestamp (should be recent)
3. Verify rules include `memberUids` checks

### Verify Cloud Functions Deployed
1. Go to Firebase Console → Functions
2. Check `createInvite` and `joinWithInviteCode` functions
3. Verify "Last deployed" timestamp (should be recent)
4. Check logs for any errors

### Check Invitations Collection
1. Go to Firebase Console → Firestore → invitations
2. Count total invitations
3. Filter by `used: false` to see active invites
4. Verify max 3 active per family

### Check Users Collection
1. Go to Firebase Console → Firestore → users
2. Verify each user has:
   - `uid` field (matches doc ID)
   - `familyId` field
   - `lastLoginAt` timestamp

### Check Families Collection
1. Go to Firebase Console → Firestore → families
2. Verify each family has:
   - `memberUids` array (flat array of UIDs)
   - `members` array (legacy, same as memberUids)
   - `primaryOwner` field

---

## CLEANUP SCRIPT TESTING

### Before Running Cleanup
1. Backup Firestore data (Firebase Console → Firestore → Export)
2. Note current user count (Firebase Console → Authentication)
3. Note current invitation count (Firestore → invitations)

### Run Cleanup Script
```bash
# Install dependencies
npm install

# Run cleanup
node cleanup-database.js
```

### After Running Cleanup
1. Verify only 1 user remains in Authentication
2. Verify only 1 user doc in Firestore users collection
3. Verify all invitations deleted
4. Verify family has only 1 member
5. Verify family has `memberUids` array

---

## TROUBLESHOOTING

### Error: "Security error: You are not a member of this family"
**Cause:** User's UID not in family's `memberUids` array  
**Fix:** Check Firestore family document, add user to `memberUids`

### Error: "Only the family owner can create invites"
**Cause:** User is not the primary owner  
**Fix:** Sign in with owner account, or promote user to owner

### Error: "Max 5 members reached"
**Cause:** Family already has 5 members  
**Fix:** Remove a member or increase limit in code

### Error: "Permission denied" in console
**Cause:** Firestore rules not deployed or incorrect  
**Fix:** Run `firebase deploy --only firestore:rules`

### User can see other user's data
**Cause:** FID not cleared on sign out, or incorrect `memberUids`  
**Fix:** 
1. Verify sign out clears FID (check console)
2. Verify family `memberUids` array is correct
3. Redeploy rules and hosting

---

## SUCCESS CRITERIA

All tests pass when:
- ✅ Different users see different Family IDs
- ✅ Sign out completely clears state
- ✅ Max 3 active invites per family
- ✅ Only owner can create invites
- ✅ Phone auth users are isolated
- ✅ No "SECURITY CHECK" errors in console
- ✅ No permission-denied errors in Firebase logs

---

## NEXT STEPS AFTER TESTING

If all tests pass:
1. ✅ Mark security audit as complete
2. ✅ Monitor Firebase Console for errors
3. ✅ Run cleanup script to remove duplicate invitations
4. ✅ Update documentation with any findings

If any test fails:
1. ❌ Document the failure
2. ❌ Check console logs and Firebase Console
3. ❌ Fix the issue
4. ❌ Redeploy affected components
5. ❌ Rerun tests

---

**Ready to test?** Start with Test 1 (Data Isolation) as it's the most critical.
