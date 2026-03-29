#!/usr/bin/env node
/**
 * FamilyOS Health Module — Seed Script
 * Creates a realistic dummy patient profile with full subcollection data.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=familyos-e3d4b \
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   FAMILY_ID=<your-family-id> \
 *   node tests/health-seed.js
 *
 * The script prints the created patient ID so E2E tests can use it.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const admin = require('firebase-admin');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'familyos-e3d4b';
const FAMILY_ID  = process.env.FAMILY_ID;
const SEED_TAG   = '[TEST-SEED]'; // marker so we can clean up safely

if (!FAMILY_ID) {
  console.error('ERROR: FAMILY_ID env var is required.\nRun: FAMILY_ID=<id> node tests/health-seed.js');
  process.exit(1);
}

// Init Admin SDK
if (!admin.apps.length) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    admin.initializeApp({ credential: admin.credential.cert(require(require('path').resolve(credPath))), projectId: PROJECT_ID });
  } else {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
}
const db = admin.firestore();
const TS = admin.firestore.FieldValue.serverTimestamp;
const now = new Date();
const dateStr = d => d.toISOString().split('T')[0];
const daysAgo = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };

// ─────────────────────────────────────────────
// SEED DATA DEFINITIONS
// ─────────────────────────────────────────────

const PATIENT = {
  name: `Arun Sharma ${SEED_TAG}`,
  relation: 'Papa',
  dob: '1952-03-15',
  bloodGroup: 'O+',
  diagnosis: 'Hepatocellular Carcinoma (Liver Cancer) Stage III',
  diagnosedOn: '2024-09-01',
  primaryDoctor: 'Dr. Suresh Nair',
  hospital: 'Tata Memorial Hospital, Mumbai',
  emergencyContact: 'Priya Sharma · +91-9876543210',
  allergies: 'Penicillin',
  aiSummary:
    'Arun is a 73-year-old male diagnosed with Stage III Hepatocellular Carcinoma in Sept 2024. ' +
    'Currently on Sorafenib targeted therapy with tolerable side effects. AFP and CA 19-9 show a ' +
    'downward trend over 3 months suggesting early treatment response. Mild ascites managed with ' +
    'Furosemide. Next imaging scheduled in 3 weeks. Key watch-points: AFP trend, fluid balance, ' +
    'and nutrition status.',
  chatHistory: [],
  qaHistory: [
    {
      q: 'Is the AFP trend improving?',
      a: 'Yes — AFP dropped from 1200 ng/mL in October to 780 ng/mL in December, a ~35% reduction. This is a positive sign of treatment response to Sorafenib. Continue monitoring monthly.',
      t: daysAgo(10).getTime(),
    },
  ],
  createdAt: TS(),
  updatedAt: TS(),
  _seedTag: SEED_TAG,
};

// Three reports over ~90 days showing improving trends
const REPORTS = [
  {
    title: 'Blood Panel + Tumour Markers — October',
    date: dateStr(daysAgo(90)),
    type: 'blood_test',
    lab: 'Thyrocare',
    urgency: 'urgent',
    aiSummary:
      'AFP critically elevated at 1200 ng/mL and CA 19-9 at 450 U/mL — both well above normal range. ' +
      'Liver enzymes ALT and AST moderately raised. Bilirubin slightly high at 2.1 mg/dL. ' +
      'Haemoglobin mildly low. Platelet count borderline. Baseline established; begin Sorafenib.',
    keyFindings: [
      { name: 'CA 19-9',      value: '450',   unit: 'U/mL',    flag: 'critical', normalRange: '<37' },
      { name: 'AFP',          value: '1200',  unit: 'ng/mL',   flag: 'critical', normalRange: '<10' },
      { name: 'CEA',          value: '8.5',   unit: 'ng/mL',   flag: 'watch',    normalRange: '<5' },
      { name: 'Bilirubin',    value: '2.1',   unit: 'mg/dL',   flag: 'watch',    normalRange: '0.2-1.2' },
      { name: 'ALT/SGPT',     value: '85',    unit: 'U/L',     flag: 'watch',    normalRange: '7-56' },
      { name: 'AST/SGOT',     value: '92',    unit: 'U/L',     flag: 'watch',    normalRange: '10-40' },
      { name: 'Alkaline Phosphatase', value: '320', unit: 'U/L', flag: 'watch', normalRange: '44-147' },
      { name: 'Hemoglobin',   value: '10.2',  unit: 'g/dL',    flag: 'watch',    normalRange: '13.5-17.5' },
      { name: 'WBC',          value: '9.8',   unit: 'K/µL',    flag: 'watch',    normalRange: '4-11' },
      { name: 'Platelets',    value: '122',   unit: 'K/µL',    flag: 'watch',    normalRange: '150-400' },
      { name: 'Creatinine',   value: '0.9',   unit: 'mg/dL',   flag: 'normal',   normalRange: '0.7-1.3' },
      { name: 'Albumin',      value: '3.0',   unit: 'g/dL',    flag: 'watch',    normalRange: '3.4-5.4' },
    ],
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    title: 'Follow-up Blood Panel — November',
    date: dateStr(daysAgo(60)),
    type: 'blood_test',
    lab: 'SRL Diagnostics',
    urgency: 'watch',
    aiSummary:
      'Encouraging improvement: AFP down to 950 ng/mL (−21% from baseline) and CA 19-9 at 380 U/mL (−16%). ' +
      'Bilirubin improved to 1.8 mg/dL. Haemoglobin slightly better at 10.8 g/dL. ' +
      'ALT and AST still mildly elevated. Sorafenib therapy continuing — consider dose optimisation.',
    keyFindings: [
      { name: 'CA 19-9',      value: '380',   unit: 'U/mL',    flag: 'critical', normalRange: '<37' },
      { name: 'AFP',          value: '950',   unit: 'ng/mL',   flag: 'critical', normalRange: '<10' },
      { name: 'Bilirubin',    value: '1.8',   unit: 'mg/dL',   flag: 'watch',    normalRange: '0.2-1.2' },
      { name: 'ALT/SGPT',     value: '72',    unit: 'U/L',     flag: 'watch',    normalRange: '7-56' },
      { name: 'AST/SGOT',     value: '78',    unit: 'U/L',     flag: 'watch',    normalRange: '10-40' },
      { name: 'Hemoglobin',   value: '10.8',  unit: 'g/dL',    flag: 'watch',    normalRange: '13.5-17.5' },
      { name: 'Platelets',    value: '135',   unit: 'K/µL',    flag: 'watch',    normalRange: '150-400' },
      { name: 'Albumin',      value: '3.1',   unit: 'g/dL',    flag: 'watch',    normalRange: '3.4-5.4' },
    ],
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    title: 'Blood Panel + Liver Function — December (Latest)',
    date: dateStr(daysAgo(5)),
    type: 'blood_test',
    lab: 'Thyrocare',
    urgency: 'watch',
    aiSummary:
      'Continued improvement across key markers. AFP now 780 ng/mL (−35% from baseline). ' +
      'CA 19-9 at 320 U/mL (−29%). Bilirubin improved to 1.5 mg/dL — approaching normal. ' +
      'Haemoglobin at 11.5 g/dL — improving. Albumin still borderline low at 3.2 g/dL; ' +
      'ensure adequate protein intake. Overall trend: positive treatment response.',
    keyFindings: [
      { name: 'CA 19-9',      value: '320',   unit: 'U/mL',    flag: 'critical', normalRange: '<37' },
      { name: 'AFP',          value: '780',   unit: 'ng/mL',   flag: 'critical', normalRange: '<10' },
      { name: 'CEA',          value: '6.2',   unit: 'ng/mL',   flag: 'watch',    normalRange: '<5' },
      { name: 'Bilirubin',    value: '1.5',   unit: 'mg/dL',   flag: 'watch',    normalRange: '0.2-1.2' },
      { name: 'ALT/SGPT',     value: '58',    unit: 'U/L',     flag: 'watch',    normalRange: '7-56' },
      { name: 'AST/SGOT',     value: '62',    unit: 'U/L',     flag: 'watch',    normalRange: '10-40' },
      { name: 'Hemoglobin',   value: '11.5',  unit: 'g/dL',    flag: 'watch',    normalRange: '13.5-17.5' },
      { name: 'WBC',          value: '7.2',   unit: 'K/µL',    flag: 'normal',   normalRange: '4-11' },
      { name: 'Platelets',    value: '148',   unit: 'K/µL',    flag: 'watch',    normalRange: '150-400' },
      { name: 'Creatinine',   value: '0.8',   unit: 'mg/dL',   flag: 'normal',   normalRange: '0.7-1.3' },
      { name: 'Albumin',      value: '3.2',   unit: 'g/dL',    flag: 'watch',    normalRange: '3.4-5.4' },
    ],
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
];

// Realistic medications for HCC — tests all 4 frequency patterns (OD/BD/TID/QID)
const MEDICATIONS = [
  {
    name: 'Sorafenib (Nexavar)',
    dose: '400mg',
    frequency: 'Twice daily (BD)',
    timing: 'Morning and night — with food, 12 hours apart',
    notes: 'Targeted therapy. Watch for hand-foot skin reaction and diarrhoea.',
    active: true,
    startDate: dateStr(daysAgo(85)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    name: 'Ursodeoxycholic Acid (UDCA)',
    dose: '300mg',
    frequency: 'Three times daily (TID)',
    timing: 'Morning, afternoon, night — after meals',
    notes: 'Liver support and bile acid regulation.',
    active: true,
    startDate: dateStr(daysAgo(85)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    name: 'Lactulose Syrup',
    dose: '15mL',
    frequency: 'Once daily (OD)',
    timing: 'Morning — diluted in water',
    notes: 'Prevents hepatic encephalopathy. Adjust dose to achieve 2-3 soft stools/day.',
    active: true,
    startDate: dateStr(daysAgo(80)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    name: 'Furosemide (Lasix)',
    dose: '40mg',
    frequency: 'Once daily (OD)',
    timing: 'Morning — monitor urine output and electrolytes',
    notes: 'For ascites management. Check potassium levels weekly.',
    active: true,
    startDate: dateStr(daysAgo(60)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    name: 'Pantoprazole',
    dose: '40mg',
    frequency: 'Once daily (OD)',
    timing: 'Morning — 30 min before breakfast',
    notes: 'Stomach protection against GI side effects of Sorafenib.',
    active: true,
    startDate: dateStr(daysAgo(85)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    name: 'Vitamin D3',
    dose: '60000 IU',
    frequency: 'Once weekly',
    timing: 'Sunday morning — with milk',
    notes: 'Deficiency correction.',
    active: true,
    startDate: dateStr(daysAgo(30)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    name: 'Spironolactone',
    dose: '50mg',
    frequency: 'Once daily (OD)',
    timing: 'Morning — for fluid retention',
    notes: 'Stopped — switched to Furosemide due to hyperkalemia.',
    active: false,
    startDate: dateStr(daysAgo(80)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
];

// Vitals — 3 readings showing improving BP and weight
const VITALS = [
  {
    date: dateStr(daysAgo(3)),
    time: '08:30',
    recordedAt: 'home',
    bp_systolic: 118,
    bp_diastolic: 76,
    pulse: 78,
    spo2: 97,
    temperature: 98.4,
    weight: 68.0,
    bloodSugar: 102,
    notes: 'Fasting — good morning reading',
    recordedAtTimestamp: TS(),
    _seedTag: SEED_TAG,
  },
  {
    date: dateStr(daysAgo(10)),
    time: '09:00',
    recordedAt: 'home',
    bp_systolic: 122,
    bp_diastolic: 80,
    pulse: 82,
    spo2: 96,
    temperature: 98.6,
    weight: 68.5,
    bloodSugar: 110,
    notes: 'Post-walk reading',
    recordedAtTimestamp: TS(),
    _seedTag: SEED_TAG,
  },
  {
    date: dateStr(daysAgo(30)),
    time: '10:00',
    recordedAt: 'hospital',
    bp_systolic: 130,
    bp_diastolic: 84,
    pulse: 88,
    spo2: 95,
    temperature: 99.1,
    weight: 70.0,
    notes: 'Hospital check before Sorafenib dose adjustment',
    recordedAtTimestamp: TS(),
    _seedTag: SEED_TAG,
  },
];

// Doctor visits
const VISITS = [
  {
    date: dateStr(daysAgo(5)),
    hospital: 'Tata Memorial Hospital, Mumbai',
    doctor: 'Dr. Suresh Nair',
    type: 'oncology',
    notes:
      'Routine follow-up after 3-month blood panel. AFP trend improving — 35% reduction. ' +
      'Sorafenib well-tolerated with Grade 1 hand-foot reaction. Continue current dose. ' +
      'Refer to dietitian for albumin improvement. CT abdomen recommended in 4 weeks.',
    actionItems: [
      'Schedule CT abdomen in 4 weeks',
      'Dietitian referral for high-protein diet',
      'Check electrolytes (K+, Na+) in 2 weeks',
    ],
    nextVisit: dateStr(daysAgo(-28)), // 28 days from now
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    date: dateStr(daysAgo(35)),
    hospital: 'Tata Memorial Hospital, Mumbai',
    doctor: 'Dr. Suresh Nair',
    type: 'oncology',
    notes:
      'November review. November blood panel shows 21% AFP reduction — good early response. ' +
      'Mild fluid accumulation (ascites) — started Furosemide 40mg. Hand-foot reaction: managed ' +
      'with moisturiser. Patient and family counselling done.',
    actionItems: ['Monitor ascites — daily weight at home', 'Resume blood panel in 4 weeks'],
    nextVisit: dateStr(daysAgo(5)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
  {
    date: dateStr(daysAgo(85)),
    hospital: 'Tata Memorial Hospital, Mumbai',
    doctor: 'Dr. Suresh Nair',
    type: 'oncology',
    notes:
      'Initial oncology consultation post-diagnosis. Review of October blood panel and CT scan. ' +
      'Stage III HCC confirmed — surgical resection not possible (portal vein involvement). ' +
      'Starting Sorafenib 400mg BD. Prognosis discussed with family. Supportive care plan set.',
    actionItems: [
      'Start Sorafenib 400mg twice daily',
      'Blood panel in 4 weeks',
      'Register at hospital pharmacy for Sorafenib supply',
      'Soft diet — no alcohol, low salt',
    ],
    nextVisit: dateStr(daysAgo(35)),
    addedAt: TS(),
    _seedTag: SEED_TAG,
  },
];

// Bills
const BILLS = [
  { date: dateStr(daysAgo(5)),  hospital: 'Tata Memorial Hospital', category: 'consultation', amount: 2500,  addedAt: TS(), _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(5)),  hospital: 'Thyrocare',              category: 'test',         amount: 4800,  addedAt: TS(), _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(20)), hospital: 'Apollo Pharmacy',        category: 'medicine',     amount: 87500, addedAt: TS(), _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(35)), hospital: 'Tata Memorial Hospital', category: 'consultation', amount: 2500,  addedAt: TS(), _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(35)), hospital: 'Tata Memorial Hospital', category: 'procedure',    amount: 18500, addedAt: TS(), _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(60)), hospital: 'SRL Diagnostics',        category: 'test',         amount: 3200,  addedAt: TS(), _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(85)), hospital: 'Tata Memorial Hospital', category: 'consultation', amount: 2500,  addedAt: TS(), _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(85)), hospital: 'Thyrocare',              category: 'test',         amount: 5600,  addedAt: TS(), _seedTag: SEED_TAG },
];

// Timeline
const TIMELINE = [
  { date: dateStr(daysAgo(5)),  type: 'visit',      title: 'Oncology follow-up — Dr. Nair',      _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(5)),  type: 'report',     title: 'December Blood Panel (Latest)',       _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(35)), type: 'visit',      title: 'November review — ascites management', _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(60)), type: 'report',     title: 'November Follow-up Blood Panel',      _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(80)), type: 'medication', title: 'Started Lactulose Syrup',             _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(85)), type: 'visit',      title: 'Initial oncology consultation',       _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(85)), type: 'report',     title: 'October Baseline Blood Panel',        _seedTag: SEED_TAG },
  { date: dateStr(daysAgo(85)), type: 'medication', title: 'Started Sorafenib 400mg BD',          _seedTag: SEED_TAG },
];

// ─────────────────────────────────────────────
// SEEDER
// ─────────────────────────────────────────────

async function seed() {
  const profilesRef = db.collection(`families/${FAMILY_ID}/healthProfiles`);

  // Remove any existing seed profiles for idempotency
  const existing = await profilesRef.where('_seedTag', '==', SEED_TAG).get();
  if (!existing.empty) {
    console.log(`Removing ${existing.size} existing seed profile(s)…`);
    const batch = db.batch();
    existing.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // Create patient profile
  const profileRef = await profilesRef.add(PATIENT);
  const pid = profileRef.id;
  console.log(`\nCreated patient profile: ${pid}`);

  const base = `families/${FAMILY_ID}/healthProfiles/${pid}`;
  const addAll = async (sub, items) => {
    for (const item of items) {
      await db.collection(`${base}/${sub}`).add(item);
    }
    console.log(`  ✓ ${items.length} ${sub} seeded`);
  };

  // Seed ordered: newest first to match Firestore orderBy('date','desc')
  await addAll('reports',     REPORTS.slice().reverse()); // seed in chronological order, Firestore will sort
  await addAll('medications', MEDICATIONS);
  await addAll('vitals',      VITALS);
  await addAll('visits',      VISITS);
  await addAll('bills',       BILLS);
  await addAll('timeline',    TIMELINE);

  // Print result for test runner to capture
  console.log('\n──────────────────────────────');
  console.log(`SEED_PATIENT_ID=${pid}`);
  console.log(`SEED_FAMILY_ID=${FAMILY_ID}`);
  console.log('──────────────────────────────');
  console.log('\nOpen the app → Health → look for "Arun Sharma [TEST-SEED]"');

  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
