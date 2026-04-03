# Firestore Investigation Script

## User's Friend Phone Number
**Phone:** +91 81694 55340
**Normalized:** +918169455340

## Steps to Investigate in Firebase Console

### Step 1: Find User Document by Phone Number

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/firestore
2. Navigate to `users` collection
3. Look for a document where `phoneNumber` field = `+918169455340`
4. Note the document ID (this is her UID)

**Expected fields:**
```json
{
  "uid": "[her-uid]",
  "phoneNumber": "+918169455340",
  "familyId": "[CRITICAL - which family?]",
  "role": "primary" or "secondary",
  "name": "[her name]",
  "email": null or "[email]",
  "createdAt": "[timestamp]"
}
```

### Step 2: Check Which Family She's In

Once you have her UID, check:
1. What is her `familyId`?
2. Is it YOUR family ID or a different one?

### Step 3: Check Your Family Document

1. Navigate to `families` collection
2. Find YOUR family document (you know your family name)
3. Check the `members` array
4. **CRITICAL:** Is her UID in the array?

**Your family document should look like:**
```json
{
  "name": "[Your Family Name]",
  "members": [
    "[your-uid]",
    "[her-uid]" ???  // ← Is this present?
  ],
  "primaryOwner": "[your-uid]",
  "memberProfiles": {
    "[your-uid]": {...},
    "[her-uid]": {...} ???  // ← Does this exist?
  },
  "modules": [...],
  "createdAt": "[timestamp]"
}
```

### Step 4: Check Her Family Document (if different)

If her `familyId` is different from yours:
1. Navigate to `families/{her-familyId}`
2. Check if this family exists
3. Check the `members` array
4. Check the `primaryOwner`

## Quick Firebase Console Query

You can use the Firebase Console's filter feature:

1. In `users` collection
2. Click "Filter" button
3. Add filter: `phoneNumber` == `+918169455340`
4. This will show her user document

## What We're Looking For

### Scenario A: She's in YOUR family (BUG!)
```
Her user doc:
  familyId: [YOUR-FAMILY-ID]  ← WRONG!
  
Your family doc:
  members: ["your-uid", "her-uid"]  ← She shouldn't be here!
```

**This means:** She was accidentally added to your family during signup or via invite link.

### Scenario B: She has her own family (CORRECT)
```
Her user doc:
  familyId: [HER-FAMILY-ID]  ← Different from yours
  
Her family doc:
  members: ["her-uid"]  ← Only her
  primaryOwner: "her-uid"
```

**This means:** Everything is correct, but there might be a different bug causing her to see your data.

### Scenario C: She has no family yet (CORRECT)
```
Her user doc:
  familyId: null or undefined
```

**This means:** She hasn't completed setup yet, should see setup screen.

## Investigation Results

Please fill this in after checking Firestore:

```
HER USER DOCUMENT:
- UID: _________________
- Phone: +918169455340
- Family ID: _________________
- Role: _________________
- Created At: _________________

YOUR FAMILY DOCUMENT:
- Family ID: _________________
- Family Name: _________________
- Members Array: [_________________]
- Does it contain her UID? YES / NO
- Primary Owner: _________________

HER FAMILY DOCUMENT (if exists):
- Family ID: _________________
- Family Name: _________________
- Members Array: [_________________]
- Primary Owner: _________________
```

## Immediate Fix Actions

### If she's in YOUR family (Scenario A):

**Option 1: Remove her from your family**
1. Edit your family document
2. Remove her UID from `members` array
3. Delete her entry from `memberProfiles` object
4. Save

**Option 2: Fix her user document**
1. Edit her user document
2. Change `familyId` to a new value OR delete it
3. Save
4. Ask her to refresh and complete setup

### If she has her own family (Scenario B):

This means the bug is different - possibly:
- Firestore rules are too permissive
- CollectionGroup queries are returning wrong data
- Client-side filtering is broken

We need to investigate further.

## Console Commands for Her

Ask her to run these in browser console:

```javascript
// 1. Check current user
console.log('My UID:', auth.currentUser.uid);
console.log('My Phone:', auth.currentUser.phoneNumber);

// 2. Check family ID
console.log('My Family ID (FID):', FID);

// 3. Check if she can read your family (she shouldn't be able to)
const testFamilyId = '[YOUR-FAMILY-ID]'; // Replace with your actual family ID
getDoc(doc(db, 'families', testFamilyId))
  .then(doc => {
    if (doc.exists()) {
      console.log('❌ BUG: I can read this family!', doc.data());
    } else {
      console.log('✅ Good: Family not found');
    }
  })
  .catch(err => {
    console.log('✅ Good: Permission denied', err.code);
  });
```

## Next Steps

1. **Check Firestore NOW** using the steps above
2. **Fill in the investigation results**
3. **Determine which scenario** (A, B, or C)
4. **Apply the appropriate fix**
5. **Ask her to refresh** and check console logs
6. **Verify she only sees her own data**

---

**PRIORITY: CRITICAL**
**ACTION: INVESTIGATE IMMEDIATELY**
