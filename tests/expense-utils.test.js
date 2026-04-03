/**
 * Unit tests for expense-utils.js
 * Run: node tests/expense-utils.test.js
 */

// Load the real module — populates globalThis.FamilyOSExpenseUtils in Node.js
require('../public/expense-utils.js');

const {
  consolidateExpenses,
  getSpendingByCategory,
  getSpendingByMerchant,
  getMerchantLink,
  extractOrderKey,
} = globalThis.FamilyOSExpenseUtils;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.log('  ✗', msg);
  }
}

function assertEqual(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.log('  ✗', msg, '- expected', JSON.stringify(b), 'got', JSON.stringify(a));
  }
}

console.log('\n=== Expense Utils Unit Tests ===\n');

// Test 1: consolidateExpenses - duplicates by merchant+date+amount
const dup1 = [
  { id: '1', merchant: 'Myntra', desc: 'Shirt', amount: 2640, date: '2026-03-09', cat: 'Clothes' },
  { id: '2', merchant: 'Myntra', desc: 'Shirt', amount: 2640, date: '2026-03-09', cat: 'Clothes' },
];
const c1 = consolidateExpenses(dup1);
assert(c1.length === 1, 'Consolidates 2 identical Myntra orders into 1');
assert(c1[0]._count === 2, 'Consolidated item has _count 2');
assert(c1[0]._groupIds?.length === 2, 'Consolidated item has _groupIds [1,2]');

// Test 2: consolidateExpenses - different amounts, same merchant+date
const dup2 = [
  { id: 'a', merchant: 'Swiggy', amount: 350, date: '2026-03-08' },
  { id: 'b', merchant: 'Swiggy', amount: 355, date: '2026-03-08' },
];
const c2 = consolidateExpenses(dup2);
assert(c2.length === 1, 'Consolidates same merchant+date with similar amount (rounded to 50)');
assert(c2[0].amount === 355, 'Keeps higher amount');

// Test 3: consolidateExpenses - different merchants stay separate
const diff = [
  { id: 'x', merchant: 'Myntra', amount: 2000, date: '2026-03-09' },
  { id: 'y', merchant: 'Swiggy', amount: 2000, date: '2026-03-09' },
];
const c3 = consolidateExpenses(diff);
assert(c3.length === 2, 'Different merchants stay separate');

// Test 4: getSpendingByCategory
const exp4 = [
  { amount: 100, cat: 'Food', date: '2026-03-01' },
  { amount: 200, cat: 'Food', date: '2026-03-02' },
  { amount: 150, cat: 'Shopping', date: '2026-03-03' },
];
const byCat = getSpendingByCategory(exp4, '2026-03');
assertEqual(byCat[0], ['Food', 300], 'Food total 300');
assertEqual(byCat[1], ['Shopping', 150], 'Shopping total 150');

// Test 5: extractOrderKey with orderDedupKey
const exp5 = { id: '1', orderDedupKey: 'myntra_ORD123', merchant: 'Myntra', amount: 1000 };
assert(extractOrderKey(exp5) === 'myntra_ORD123', 'Uses orderDedupKey when present');

// Test 6: empty input
assert(consolidateExpenses([]).length === 0, 'Empty array returns empty');
assert(consolidateExpenses(null).length === 0, 'Null returns empty');

console.log('\n--- Results ---');
console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
