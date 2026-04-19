# Database Cleanup Instructions

## ⚠️ WARNING: THIS IS IRREVERSIBLE!

This will delete ALL users except `prashantchintanwar@gmail.com` and ALL invitations.

## Option 1: Run Node.js Script (Recommended)

### Prerequisites
1. Node.js installed
2. Firebase Admin SDK

### Steps

**1. Download Service Account Key**
1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/settings/serviceaccounts/adminsdk
2. Click "Generate new private key"
3. Save as `serviceAccountKey.json` in the project root
4. **IMPORTANT:** Never commit this file to Git!

**2. Install Dependencies**
```bash
cd /Users/pchintanwar/Documents/Projects-AIProductivity/familyOS
npm install firebase-admin
```

**3. Run the Script**
```bash
node cleanup-database.js
```

**4. Review the Output**
The script will show:
- Which user is being kept
- How many users are deleted
- How many invitations are deleted
- Which families are cleaned

## Option 2: Manual Cleanup in Firebase Console

If you prefer to do it manually:

### A. Delete Users from Firestore

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/users
2. For each user document (except yours):
   - Click on the document
   - Click trash icon 🗑️
   - Confirm deletion

### B. Delete Users from Authentication

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/authentication/users
2. For each user (except `prashantchintanwar@gmail.com`):
   - Click on the user row
   - Click "Delete user"
   - Confirm deletion

### C. Delete All Invitations

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/invitations
2. For each invitation document:
   - Click on the document
   - Click trash icon 🗑️
   - Confirm deletion

### D. Clean Your Family

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data/families
2. Find YOUR family document
3. Click "Edit Document"
4. In the `members` array, keep only your UID
5. In the `memberProfiles` object, keep only your entry
6. Click "Update"

## What Gets Deleted

### ✅ Will Be Deleted:
- All users except `prashantchintanwar@gmail.com` (Firestore)
- All users except `prashantchintanwar@gmail.com` (Authentication)
- All invitations
- Other users from your family's members array
- Other users from your family's memberProfiles
- Families that don't belong to you
- App logs (optional)

### ✅ Will Be Kept:
- Your user account (`prashantchintanwar@gmail.com`)
- Your family document
- Your family's data (expenses, tasks, health profiles, etc.)
- All your personal data

## Verification After Cleanup

### 1. Check Users Collection
```
Firestore → users
Should have ONLY 1 document (yours)
```

### 2. Check Authentication
```
Authentication → Users
Should have ONLY 1 user (prashantchintanwar@gmail.com)
```

### 3. Check Invitations
```
Firestore → invitations
Should be EMPTY (0 documents)
```

### 4. Check Your Family
```
Firestore → families → [your-family-id]
members: [only your UID]
memberProfiles: {only your entry}
```

## After Cleanup

1. **Refresh your app** - You should still see all your data
2. **Test login** - Sign out and sign in again
3. **Verify isolation** - No other users should exist
4. **Create new invite** - If you want to invite someone fresh

## Troubleshooting

### Script Fails with "Permission Denied"
- Make sure you downloaded the correct service account key
- Make sure the key file is named `serviceAccountKey.json`
- Make sure it's in the project root directory

### Can't Find Your User
- The script looks for email: `prashantchintanwar@gmail.com`
- Make sure this is exactly your email (case-sensitive)
- Check in Firestore that your user doc has this email

### Script Deletes Too Much
- The script has a dry-run mode (commented out)
- Review the code before running
- Make a Firestore backup first (see below)

## Backup First (Recommended)

Before running cleanup:

1. Go to: https://console.firebase.google.com/project/familyos-e3d4b/firestore/data
2. Click "Import/Export" at the top
3. Click "Export"
4. Choose a Cloud Storage bucket
5. Click "Export"

This creates a backup you can restore if needed.

## Quick Firestore Backup Command

```bash
gcloud firestore export gs://familyos-e3d4b.appspot.com/backup-$(date +%Y%m%d)
```

## Need Help?

If you're not comfortable running the script:
1. Share your Firebase Console access
2. I can guide you through manual deletion
3. Or we can do it step-by-step together

---

**IMPORTANT:** 
- ⚠️ This is irreversible
- ⚠️ Backup your data first
- ⚠️ Double-check the email address
- ⚠️ Review the script before running
