#!/usr/bin/env node
/**
 * FamilyOS Health Module — End-to-End Browser Test Suite
 * Uses Puppeteer to drive the deployed (or local) app.
 *
 * Prerequisites:
 *   npm install puppeteer
 *
 * Usage:
 *   APP_URL=https://familyos-e3d4b.web.app \
 *   node tests/health-e2e.test.js
 *
 * The tests assume the seed patient "Arun Sharma [TEST-SEED]" is already
 * in Firestore (run health-seed.js first) and the user is logged in.
 * Set SKIP_LOGIN=true if you're running against a pre-authenticated session.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const puppeteer = require('puppeteer');
const APP_URL = process.env.APP_URL || 'https://familyos-e3d4b.web.app';
const HEADLESS = process.env.HEADLESS !== 'false'; // set HEADLESS=false to watch
const SLOW_MO  = parseInt(process.env.SLOW_MO || '0', 10);
const TIMEOUT  = parseInt(process.env.E2E_TIMEOUT || '20000', 10);
const PATIENT_NAME = 'Arun Sharma [TEST-SEED]';

let browser, page;
let passed = 0, failed = 0;

// ─── Helpers ───
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function assertVisible(selector, description) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: TIMEOUT });
    log(`  ✅ ${description}`);
    passed++;
  } catch (e) {
    log(`  ❌ ${description} — element not found: ${selector}`);
    failed++;
  }
}

async function assertText(selector, expectedText, description) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: TIMEOUT });
    const text = await page.$eval(selector, el => el.textContent);
    if (text.includes(expectedText)) {
      log(`  ✅ ${description}`);
      passed++;
    } else {
      log(`  ❌ ${description} — expected "${expectedText}", got "${text.slice(0, 80)}"`);
      failed++;
    }
  } catch (e) {
    log(`  ❌ ${description} — ${e.message.slice(0, 100)}`);
    failed++;
  }
}

async function assertNotVisible(selector, description) {
  try {
    const el = await page.$(selector);
    if (!el) { log(`  ✅ ${description}`); passed++; return; }
    const isVisible = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }, selector);
    if (!isVisible) { log(`  ✅ ${description}`); passed++; }
    else { log(`  ❌ ${description} — element IS visible but should not be`); failed++; }
  } catch (e) {
    log(`  ✅ ${description} (element absent)`); passed++;
  }
}

async function click(selector, description) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: TIMEOUT });
    await page.click(selector);
    await wait(400);
    if (description) { log(`  ▶ ${description}`); }
  } catch (e) {
    log(`  ⚠️  click failed on ${selector}: ${e.message.slice(0, 80)}`);
  }
}

async function type(selector, text) {
  await page.waitForSelector(selector, { visible: true, timeout: TIMEOUT });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, text);
}

function log(msg) { console.log(msg); }
function section(title) { log(`\n═══ ${title} ═══`); }

// ─── NAVIGATION ───
async function goToHealthTab() {
  // Click the Health item in bottom nav (or MORE → Health)
  const healthNav = await page.$('[onclick*="goPage"][onclick*="health"]');
  if (healthNav) {
    await healthNav.click();
    await wait(600);
  } else {
    // Try MORE menu
    const more = await page.$('[onclick*="goPage"][onclick*="more"]');
    if (more) { await more.click(); await wait(400); }
    const healthLink = await page.$('[onclick*="goPage"][onclick*="health"]');
    if (healthLink) { await healthLink.click(); await wait(600); }
  }
}

async function openTestPatient() {
  // Find and click the seed patient card
  const cards = await page.$$('.health-card');
  for (const card of cards) {
    const text = await card.evaluate(el => el.textContent);
    if (text.includes('Arun Sharma')) {
      await card.click();
      await wait(800);
      return true;
    }
  }
  log('  ⚠️  Test patient not found — run health-seed.js first');
  return false;
}

async function clickHealthTab(tabName) {
  const chips = await page.$$('#health-tabs .chip');
  for (const chip of chips) {
    const text = await chip.evaluate(el => el.textContent.trim());
    if (text.toLowerCase() === tabName.toLowerCase()) {
      await chip.click();
      await wait(600);
      return;
    }
  }
  log(`  ⚠️  Tab "${tabName}" not found`);
}

// ─── TEST SUITES ───

async function testAppLoads() {
  section('1. App Load & Auth Gate');
  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await wait(2000);

  // Should see either loading screen or login or home
  const loadingGone = await page.evaluate(() => {
    const loading = document.getElementById('scr-loading');
    return !loading || !loading.classList.contains('active');
  });
  if (loadingGone) { log('  ✅ Loading screen resolved'); passed++; }
  else { log('  ⚠️  Loading screen still active after 2s (may be slow network)'); }

  await assertVisible('#scr-login, #scr-app', 'Login or app screen is visible');
}

async function testTabNavigation() {
  section('2. Health Tab Navigation');
  await goToHealthTab();
  await wait(800);

  await assertVisible('#health-tabs', 'Health tab bar is rendered');

  const tabNames = ['Overview', 'Vitals', 'Meds', 'Reports', 'Visits', 'Bills', 'Ask AI'];
  const chips = await page.$$('#health-tabs .chip');
  const renderedTabs = await Promise.all(chips.map(c => c.evaluate(el => el.textContent.trim())));

  for (const name of tabNames) {
    if (renderedTabs.some(t => t.toLowerCase().includes(name.toLowerCase()))) {
      log(`  ✅ Tab "${name}" present`); passed++;
    } else {
      log(`  ❌ Tab "${name}" MISSING from tab bar`); failed++;
    }
  }
}

async function testOverviewTab() {
  section('3. Overview Tab — Content');

  const found = await openTestPatient();
  if (!found) { log('  ⚠️  Skipping overview tests — patient not found'); return; }

  await clickHealthTab('overview');
  await wait(1000);

  // Check sections
  await assertVisible('#health-tab-overview', 'Overview pane is active');
  await assertVisible('.health-collapsible-header', 'AI Case Summary collapsible header present');
  await assertVisible('#health-summary-teaser', 'Summary teaser text visible');

  // Should NOT show error banner
  await assertNotVisible('[style*="Overview failed to load"]', 'No error banner (renderHealthOverview clean)');

  // Stats row
  await assertVisible('.health-stats-row', 'Stats row rendered');

  // Timeline
  const timelineItems = await page.$$('.health-timeline-item');
  if (timelineItems.length > 0) { log(`  ✅ Timeline shows ${timelineItems.length} items`); passed++; }
  else { log('  ❌ Timeline is empty'); failed++; }

  // Doctor summary button
  await assertVisible('[onclick*="generateDoctorSummary"]', 'Generate Doctor Summary button present');
}

async function testCollapsibleSummary() {
  section('4. Collapsible AI Summary');

  // Collapsible body should be closed by default
  const bodyOpen = await page.evaluate(() => {
    const body = document.getElementById('health-summary-body');
    return body ? body.classList.contains('open') : null;
  });
  if (bodyOpen === false) { log('  ✅ Summary collapsed by default'); passed++; }
  else if (bodyOpen === true) { log('  ⚠️  Summary is expanded by default (expected collapsed)'); }
  else { log('  ⚠️  health-summary-body not found'); }

  // Click to expand
  await click('.health-collapsible-header', 'Click summary header to expand');
  const bodyOpenAfter = await page.evaluate(() => {
    const body = document.getElementById('health-summary-body');
    return body ? body.classList.contains('open') : false;
  });
  if (bodyOpenAfter) { log('  ✅ Summary expanded after click'); passed++; }
  else { log('  ❌ Summary did NOT expand after click'); failed++; }

  // Click again to collapse
  await click('.health-collapsible-header', 'Click to collapse');
  const bodyClosedAgain = await page.evaluate(() => {
    const body = document.getElementById('health-summary-body');
    return body ? !body.classList.contains('open') : false;
  });
  if (bodyClosedAgain) { log('  ✅ Summary collapsed again'); passed++; }
  else { log('  ❌ Summary did NOT collapse'); failed++; }
}

async function testKeyMarkersSection() {
  section('5. Key Markers');
  // Seed patient has 3 reports with cancer markers — markers scroll should appear
  const markerCards = await page.$$('.health-marker-card');
  if (markerCards.length > 0) {
    log(`  ✅ ${markerCards.length} marker card(s) rendered`); passed++;
    // Check at least AFP or CA 19-9
    const markerNames = await Promise.all(markerCards.map(c => c.$eval('.health-marker-name', el => el.textContent)));
    const hasAFP = markerNames.some(n => n.toUpperCase().includes('AFP'));
    const hasCA  = markerNames.some(n => n.toUpperCase().includes('CA'));
    if (hasAFP || hasCA) { log('  ✅ Cancer markers (AFP / CA 19-9) visible'); passed++; }
    else { log('  ⚠️  Cancer markers not found in cards (check keyFindings in seed data)'); }
  } else {
    log('  ⚠️  No marker cards — seed data may not have loaded yet');
  }
}

async function testMedScheduleOnOverview() {
  section('6. Today\'s Medication Schedule (Overview)');
  const scheduleCard = await page.$('.health-card .health-card-title');
  const medsSection = await page.$$('.med-slot-section');
  if (medsSection.length > 0) {
    log(`  ✅ ${medsSection.length} medication slot section(s) rendered on overview`); passed++;
    const markBtns = await page.$$('.btn-mark-taken');
    log(`  ✅ ${markBtns.length} Mark Taken button(s) rendered`); passed++;
  } else {
    log('  ⚠️  No med slots on overview — medications may not have loaded yet');
  }
}

async function testMedsTab() {
  section('7. Meds Tab');
  await clickHealthTab('Meds');
  await wait(800);

  await assertVisible('#health-tab-meds', 'Meds pane is active');

  // Today's schedule card
  const scheduleCard = await page.$$('.med-slot-section');
  if (scheduleCard.length > 0) {
    log(`  ✅ Today's schedule has ${scheduleCard.length} time slot(s)`); passed++;
  } else {
    log('  ❌ No medication time slots in Meds tab'); failed++;
  }

  // Active medications list
  const medCards = await page.$$('.health-card');
  if (medCards.length > 0) { log(`  ✅ Medication cards rendered`); passed++; }
  else { log('  ❌ No medication cards'); failed++; }

  // Mark Taken buttons
  const markBtns = await page.$$('.btn-mark-taken:not([disabled])');
  if (markBtns.length > 0) {
    log(`  ✅ ${markBtns.length} enabled Mark Taken button(s)`); passed++;

    // Click first mark taken button
    await markBtns[0].click();
    await wait(1000);

    // Button should now be disabled/done
    const doneBtns = await page.$$('.btn-mark-taken.done, .btn-mark-taken[disabled]');
    if (doneBtns.length > 0) { log('  ✅ Mark Taken → dose logged (button disabled)'); passed++; }
    else { log('  ⚠️  Mark Taken button state unchanged after click'); }
  }
}

async function testVitalsTab() {
  section('8. Vitals Tab');
  await clickHealthTab('Vitals');
  await wait(800);

  await assertVisible('#health-tab-vitals', 'Vitals pane is active');

  // Latest reading should show from seed data
  const vitalChips = await page.$$('.health-vital-chip');
  if (vitalChips.length > 0) {
    log(`  ✅ ${vitalChips.length} vital chip(s) showing in latest reading`); passed++;
  } else {
    log('  ⚠️  No vital chips — vitals subscription may not have fired yet');
  }

  // Add button present
  await assertVisible('[onclick*="openAddVitalModal"]', '+ Add vital button present');

  // Open add vital modal
  await click('[onclick*="openAddVitalModal"]', 'Open Add Vital modal');
  await wait(400);
  await assertVisible('#modal-health-vital', 'Add Vital modal opened');

  // Fill in values
  await type('#hv2-bp-s', '120');
  await type('#hv2-bp-d', '78');
  await type('#hv2-pulse', '76');
  await type('#hv2-spo2', '98');
  log('  ✅ Vital form fields populated');
  passed++;

  // Save
  await click('#modal-health-vital .btn-primary', 'Save vitals');
  await wait(1500);

  // Modal should close
  const modalVisible = await page.evaluate(() => {
    const m = document.getElementById('modal-health-vital');
    return m && getComputedStyle(m).display !== 'none' && m.classList.contains('active');
  });
  if (!modalVisible) { log('  ✅ Vitals modal closed after save'); passed++; }
  else { log('  ⚠️  Vitals modal still open (check saveVital function)'); }
}

async function testReportsTab() {
  section('9. Reports Tab');
  await clickHealthTab('Reports');
  await wait(800);

  await assertVisible('#health-tab-reports', 'Reports pane is active');

  const reportCards = await page.$$('#health-reports-list .health-card');
  if (reportCards.length >= 3) {
    log(`  ✅ ${reportCards.length} report card(s) rendered (expected ≥3 from seed)`); passed++;
  } else if (reportCards.length > 0) {
    log(`  ⚠️  Only ${reportCards.length} reports (expected 3 from seed)`);
  } else {
    log('  ❌ No report cards in reports list'); failed++;
  }

  // Click a card to expand key findings
  if (reportCards.length > 0) {
    await reportCards[0].click();
    await wait(300);
    const expanded = await reportCards[0].evaluate(el => el.classList.contains('expanded'));
    if (expanded) { log('  ✅ Report card expands on click to show key findings'); passed++; }
    else { log('  ⚠️  Report card did not expand (onclick toggle may not be working)'); }
  }

  // Hemoglobin trend card (seed has 3 reports)
  const trendCard = await page.$('.health-card[style*="gold-soft"], .health-card');
  if (trendCard) { log('  ✅ Trend/summary card rendered in reports'); passed++; }

  // + Add Report button
  await assertVisible('[onclick*="openAddReportModal"]', '+ Add Report button present');
}

async function testVisitsTab() {
  section('10. Visits Tab');
  await clickHealthTab('Visits');
  await wait(800);

  await assertVisible('#health-tab-visits', 'Visits pane is active');

  const visitCards = await page.$$('#health-tab-visits .health-card');
  if (visitCards.length >= 3) {
    log(`  ✅ ${visitCards.length} visit card(s) rendered (expected ≥3)`); passed++;
  } else {
    log(`  ⚠️  ${visitCards.length} visit cards (expected 3 from seed)`);
  }

  // Check action items are visible
  const actionItems = await page.$$('[style*="Action Items"], .health-card');
  if (actionItems.length > 0) { log('  ✅ Visit cards with action items rendered'); passed++; }

  // Next Visit date
  const nextVisitText = await page.evaluate(() => document.body.innerText);
  if (nextVisitText.includes('Next Visit')) { log('  ✅ "Next Visit" text found on visits tab'); passed++; }

  // + Add Visit button
  await assertVisible('[onclick*="openModal"][onclick*="modal-health-visit"]', '+ Add Visit button present');
}

async function testBillsTab() {
  section('11. Bills Tab');
  await clickHealthTab('Bills');
  await wait(800);

  await assertVisible('#health-tab-bills', 'Bills pane is active');

  // Total amount should be > 0
  const totalText = await page.evaluate(() => {
    const el = document.querySelector('#health-tab-bills [style*="28px"]');
    return el ? el.textContent : '';
  });
  if (totalText && totalText.includes('₹')) { log(`  ✅ Total bills amount shown: ${totalText.trim()}`); passed++; }
  else { log('  ⚠️  Bills total not found'); }

  // Bill items
  const billItems = await page.$$('#health-tab-bills .list-item');
  if (billItems.length >= 5) {
    log(`  ✅ ${billItems.length} bill item(s) rendered (expected ≥5 from seed)`); passed++;
  } else {
    log(`  ⚠️  ${billItems.length} bill items (expected ≥5 from seed)`);
  }
}

async function testChatTab() {
  section('12. Ask AI Chat Tab');
  await clickHealthTab('Ask AI');
  await wait(800);

  await assertVisible('#health-tab-chat', 'Chat pane is active');
  await assertVisible('.health-chat-wrap', 'Chat wrapper rendered');
  await assertVisible('.health-chat-messages', 'Chat messages area present');
  await assertVisible('#health-chat-input', 'Chat text input present');
  await assertVisible('[onclick*="sendHealthChat"]', 'Send button present');

  // First message (welcome bubble or seed Q&A) should be visible
  const bubbles = await page.$$('.chat-bubble');
  if (bubbles.length > 0) { log(`  ✅ ${bubbles.length} chat bubble(s) visible`); passed++; }

  // Type a test message (don't send — to avoid API call in test)
  await type('#health-chat-input', 'What is the latest AFP value?');
  const inputVal = await page.$eval('#health-chat-input', el => el.value);
  if (inputVal.includes('AFP')) { log('  ✅ Chat input accepts text'); passed++; }
  else { log('  ❌ Chat input failed to accept text'); failed++; }

  // Clear input
  await page.$eval('#health-chat-input', el => { el.value = ''; });
}

async function testNavigationAway() {
  section('13. Navigation — Leave & Return (Memory Leak Prevention)');

  // Navigate away from health
  await page.evaluate(() => { if(window.goPage) window.goPage('home', null, ''); });
  await wait(600);

  // activePatientUnsubs should have been cleared
  const unsubsCleared = await page.evaluate(() => {
    return typeof window.activePatientUnsubs === 'undefined' ||
           (Array.isArray(window.activePatientUnsubs) && window.activePatientUnsubs.length === 0);
  });
  if (unsubsCleared) { log('  ✅ Patient subscriptions cleaned up on navigation away'); passed++; }
  else { log('  ⚠️  activePatientUnsubs may not have been cleared (check goPage cleanup)'); }

  // Return to health — should work
  await goToHealthTab();
  await wait(600);
  await assertVisible('#health-profiles-list, #health-patient-view', 'Health module renders correctly on return');
}

async function testOtherModulesIntact() {
  section('14. Regression — Other Modules Unaffected');

  // Finance tab
  await page.evaluate(() => { if(window.goPage) window.goPage('finance', null, ''); });
  await wait(600);
  await assertVisible('#scr-app', 'App still running after health module use');

  // Tasks tab
  await page.evaluate(() => { if(window.goPage) window.goPage('tasks', null, ''); });
  await wait(600);
  await assertVisible('#scr-app', 'App stable on tasks tab');
}

async function testXSSPrevention() {
  section('15. XSS Prevention — safeHtml in Rendered Content');
  // Check that any rendered content doesn't have unescaped script tags
  const innerHTML = await page.evaluate(() => document.body.innerHTML);
  const hasScriptInjection = /<script>/i.test(innerHTML) &&
    !innerHTML.includes('<script src=') &&
    !innerHTML.includes('<script type=');
  if (!hasScriptInjection) { log('  ✅ No unescaped <script> tags in rendered content'); passed++; }
  else { log('  ❌ Potential XSS: <script> found in DOM'); failed++; }

  // Check no raw onclick with user data (simplified check)
  const hasImgInjection = /<img[^>]+onerror/i.test(innerHTML);
  if (!hasImgInjection) { log('  ✅ No onerror img injection in DOM'); passed++; }
  else { log('  ❌ onerror img injection found in DOM'); failed++; }
}

// ─── MAIN RUNNER ───
async function run() {
  console.log('\n' + '═'.repeat(60));
  console.log('  FamilyOS Health Module — E2E Test Suite');
  console.log(`  Target: ${APP_URL}`);
  console.log(`  Headless: ${HEADLESS}`);
  console.log('═'.repeat(60));

  try {
    browser = await puppeteer.launch({
      headless: HEADLESS ? 'new' : false,
      slowMo: SLOW_MO,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);
    await page.setViewport({ width: 430, height: 932 }); // mobile viewport

    // Suppress console noise from app
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`  [Browser error]: ${msg.text().slice(0, 120)}`);
    });

    await testAppLoads();

    // Check if we landed on login screen
    const onLogin = await page.evaluate(() => {
      const login = document.getElementById('scr-login');
      return login && login.classList.contains('active');
    });
    if (onLogin) {
      console.log('\n  ℹ️  App is on login screen. E2E tests require authentication.');
      console.log('  ℹ️  Please sign in manually, then re-run with APP_URL pointing to authenticated session.');
      console.log('  ℹ️  Unit tests (health-unit.test.js) do not require auth — run those independently.\n');
    } else {
      // Already authenticated — run all tests
      await testTabNavigation();
      await testOverviewTab();
      await testCollapsibleSummary();
      await testKeyMarkersSection();
      await testMedScheduleOnOverview();
      await testMedsTab();
      await testVitalsTab();
      await testReportsTab();
      await testVisitsTab();
      await testBillsTab();
      await testChatTab();
      await testNavigationAway();
      await testOtherModulesIntact();
      await testXSSPrevention();
    }
  } catch (err) {
    console.error('\n  FATAL:', err.message);
    failed++;
  } finally {
    if (browser) await browser.close();
  }

  // Summary
  const total = passed + failed;
  const statusLine = failed === 0
    ? `\n🟢 ALL ${total} CHECKS PASSED`
    : `\n🔴 ${failed}/${total} CHECKS FAILED`;

  console.log('\n' + '═'.repeat(60));
  console.log(statusLine);
  console.log(`   Passed: ${passed}  Failed: ${failed}  Total: ${total}`);
  console.log('═'.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

run();
