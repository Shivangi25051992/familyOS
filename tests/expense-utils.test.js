/**
 * Unit tests for expense-utils.js
 * Run: node tests/expense-utils.test.js
 */

// Mock FamilyOSExpenseUtils by loading the logic (Node doesn't have window)
const MERCHANT_LINKS = {
  myntra: 'myntra://app',
  swiggy: 'swiggy://',
  amazon: 'https://www.amazon.in/gp/your-orders',
};

function extractOrderKey(exp) {
  if (exp.orderDedupKey) return exp.orderDedupKey;
  const merchant = (exp.merchant || exp.notes || exp.desc || '').toLowerCase().replace(/\s+/g, '');
  const date = exp.date || '';
  const amount = Number(exp.amount) || 0;
  const desc = (exp.desc || exp.notes || '').toLowerCase();
  const orderIdMatch = desc.match(/(?:order\s*#?\s*([a-z0-9\-]+)|#([a-z0-9\-]+))/i) ||
    (exp.notes || '').match(/(?:order\s*#?\s*([a-z0-9\-]+)|#([a-z0-9\-]+))/i);
  const orderId = orderIdMatch ? (orderIdMatch[1] || orderIdMatch[2] || '').trim() : exp.orderId || null;
  if (orderId && merchant) return `${merchant.slice(0, 15)}_${orderId}`;
  return `${merchant.slice(0, 15)}_${date}_${Math.round(amount / 50) * 50}`;
}

function consolidateExpenses(expenses) {
  if (!expenses || !expenses.length) return [];
  const groups = new Map();
  expenses.forEach(exp => {
    const key = extractOrderKey(exp);
    const existing = groups.get(key);
    if (existing) {
      if (!existing._groupIds) existing._groupIds = [existing.id];
      existing._groupIds.push(exp.id);
      existing._count = (existing._count || 1) + 1;
      if (exp.amount > (existing.amount || 0)) {
        existing.amount = exp.amount;
        existing.desc = exp.desc || existing.desc;
      }
    } else {
      const copy = { ...exp, _groupIds: [exp.id], _count: 1 };
      groups.set(key, copy);
    }
  });
  return Array.from(groups.values());
}

function getSpendingByCategory(expenses, monthStr) {
  const filtered = monthStr
    ? expenses.filter(e => (e.date || '').startsWith(monthStr))
    : expenses;
  const byCat = {};
  filtered.forEach(e => {
    const c = e.cat || 'Other';
    byCat[c] = (byCat[c] || 0) + (e.amount || 0);
  });
  return Object.entries(byCat).sort((a, b) => b[1] - a[1]);
}

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
