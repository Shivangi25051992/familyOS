/**
 * CRITICAL: Database Cleanup Script
 * 
 * This script will:
 * 1. Keep ONLY user: prashantchintanwar@gmail.com
 * 2. Delete all other users from Firestore
 * 3. Delete all other users from Firebase Authentication
 * 4. Delete all invitations
 * 5. Remove other users from families
 * 6. Add memberUids to all family documents (security fix)
 * 
 * WARNING: THIS IS IRREVERSIBLE!
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // You need to download this

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

const KEEP_EMAIL = 'prashantchintanwar@gmail.com';

// Helper to add memberUids to family documents
async function addMemberUidsToFamilies() {
  console.log('\n🔧 Adding memberUids to family documents...');
  const familiesSnapshot = await db.collection('families').get();
  
  for (const familyDoc of familiesSnapshot.docs) {
    const familyData = familyDoc.data();
    
    // Skip if memberUids already exists
    if (familyData.memberUids && Array.isArray(familyData.memberUids)) {
      console.log('  ✅ Family', familyDoc.id, 'already has memberUids');
      continue;
    }
    
    // Extract UIDs from members array or memberProfiles
    let memberUids = [];
    if (familyData.members && Array.isArray(familyData.members)) {
      memberUids = familyData.members;
    } else if (familyData.memberProfiles) {
      memberUids = Object.keys(familyData.memberProfiles).filter(key => 
        familyData.memberProfiles[key].uid || key.length > 10
      );
    }
    
    if (memberUids.length > 0) {
      await familyDoc.ref.update({
        memberUids: memberUids
      });
      console.log('  ✅ Added memberUids to family', familyDoc.id, ':', memberUids);
    }
  }
}

async function cleanupDatabase() {
  console.log('🚀 Starting database cleanup...');
  console.log('⚠️  Will keep ONLY:', KEEP_EMAIL);
  console.log('');
  
  try {
    // Step 1: Find the user to keep
    console.log('Step 1: Finding user to keep...');
    const usersSnapshot = await db.collection('users').get();
    let keepUserId = null;
    let keepUserData = null;
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      if (userData.email === KEEP_EMAIL) {
        keepUserId = doc.id;
        keepUserData = userData;
        console.log('✅ Found user to keep:', keepUserId);
        console.log('   Email:', userData.email);
        console.log('   Family ID:', userData.familyId);
        break;
      }
    }
    
    if (!keepUserId) {
      console.error('❌ ERROR: Could not find user with email:', KEEP_EMAIL);
      return;
    }
    
    // Step 2: Delete other users from Firestore
    console.log('\nStep 2: Deleting other users from Firestore...');
    let deletedUsersCount = 0;
    
    for (const doc of usersSnapshot.docs) {
      if (doc.id !== keepUserId) {
        console.log('  Deleting user:', doc.id, '(', doc.data().email || doc.data().phoneNumber, ')');
        await doc.ref.delete();
        deletedUsersCount++;
      }
    }
    console.log('✅ Deleted', deletedUsersCount, 'users from Firestore');
    
    // Step 3: Delete other users from Firebase Authentication
    console.log('\nStep 3: Deleting other users from Firebase Authentication...');
    let deletedAuthCount = 0;
    let authUsers = [];
    
    // List all users (pagination)
    let nextPageToken;
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      authUsers = authUsers.concat(listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);
    
    console.log('  Found', authUsers.length, 'users in Authentication');
    
    for (const user of authUsers) {
      if (user.uid !== keepUserId) {
        console.log('  Deleting auth user:', user.uid, '(', user.email || user.phoneNumber, ')');
        await auth.deleteUser(user.uid);
        deletedAuthCount++;
      }
    }
    console.log('✅ Deleted', deletedAuthCount, 'users from Authentication');
    
    // Step 4: Clean up families - remove other users and add memberUids
    console.log('\nStep 4: Cleaning up families...');
    const familiesSnapshot = await db.collection('families').get();
    
    for (const familyDoc of familiesSnapshot.docs) {
      const familyData = familyDoc.data();
      const familyId = familyDoc.id;
      
      // Check if this is the keep user's family
      if (familyData.primaryOwner === keepUserId || familyData.members?.includes(keepUserId)) {
        console.log('  Cleaning family:', familyId, '(', familyData.name, ')');
        
        // Remove other users from members array
        const cleanedMembers = [keepUserId];
        
        // Remove other users from memberProfiles
        const cleanedMemberProfiles = {
          [keepUserId]: familyData.memberProfiles?.[keepUserId] || {}
        };
        
        await familyDoc.ref.update({
          members: cleanedMembers,
          memberUids: [keepUserId], // SECURITY: Add flat array for rules
          memberProfiles: cleanedMemberProfiles
        });
        
        console.log('  ✅ Cleaned family - kept only:', keepUserId);
      } else {
        // This family doesn't belong to the keep user - delete it
        console.log('  Deleting family:', familyId, '(', familyData.name, ')');
        
        // Delete all subcollections first
        const subcollections = ['expenses', 'tasks', 'reminders', 'kidEvents', 'healthProfiles', 'autoExpenses'];
        for (const subcollection of subcollections) {
          const subcollectionSnapshot = await familyDoc.ref.collection(subcollection).get();
          for (const subDoc of subcollectionSnapshot.docs) {
            await subDoc.ref.delete();
          }
        }
        
        // Delete the family document
        await familyDoc.ref.delete();
        console.log('  ✅ Deleted family');
      }
    }
    
    // Step 5: Delete all invitations
    console.log('\nStep 5: Deleting all invitations...');
    const invitationsSnapshot = await db.collection('invitations').get();
    let deletedInvitationsCount = 0;
    
    for (const inviteDoc of invitationsSnapshot.docs) {
      console.log('  Deleting invitation:', inviteDoc.id);
      await inviteDoc.ref.delete();
      deletedInvitationsCount++;
    }
    console.log('✅ Deleted', deletedInvitationsCount, 'invitations');
    
    // Step 6: Delete app logs (optional)
    console.log('\nStep 6: Deleting app logs...');
    const appLogsSnapshot = await db.collection('appLogs').get();
    let deletedLogsCount = 0;
    
    for (const logDoc of appLogsSnapshot.docs) {
      await logDoc.ref.delete();
      deletedLogsCount++;
    }
    console.log('✅ Deleted', deletedLogsCount, 'app logs');
    
    // Step 7: Add memberUids to all remaining families
    await addMemberUidsToFamilies();
    
    // Summary
    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ CLEANUP COMPLETE');
    console.log('═══════════════════════════════════════════════════');
    console.log('Kept user:', KEEP_EMAIL, '(', keepUserId, ')');
    console.log('Deleted users from Firestore:', deletedUsersCount);
    console.log('Deleted users from Authentication:', deletedAuthCount);
    console.log('Deleted invitations:', deletedInvitationsCount);
    console.log('Deleted app logs:', deletedLogsCount);
    console.log('Cleaned families: Removed other members, added memberUids');
    console.log('═══════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ ERROR:', error);
    throw error;
  }
}

// Run the cleanup
cleanupDatabase()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
