/**
 * FamilyOS Expense Utilities
 * Deduplication, consolidation, summaries, and insights
 */

(function(global) {
  'use strict';

  const MERCHANT_LINKS = {
    myntra: 'myntra://app',
    swiggy: 'swiggy://',
    zomato: 'zomato://',
    amazon: 'https://www.amazon.in/gp/your-orders',
    flipkart: 'https://www.flipkart.com/account/orders',
    zepto: 'zepto://',
    blinkit: 'blinkit://',
    instamart: 'swiggy://',
    bigbasket: 'https://www.bigbasket.com/orders/',
    nykaa: 'https://www.nykaa.com/orders',
  };

  /**
   * Extract order key for deduplication (merchant+orderId or merchant+date+amount)
   */
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

  /**
   * Consolidate duplicate expenses (same order, merchant+date+amount)
   * Returns array of { ...expense, _groupIds: [ids], _count: n }
   */
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

  /**
   * Get spending by category for current month
   */
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

  /**
   * Get spending by merchant/source for current month
   */
  function getSpendingByMerchant(expenses, monthStr) {
    const filtered = monthStr
      ? expenses.filter(e => (e.date || '').startsWith(monthStr))
      : expenses;
    const inferSource = e => {
      if (e.source && e.source !== 'other') return e.source;
      const t = ((e.notes || '') + (e.desc || '')).toLowerCase();
      if (t.includes('swiggy')) return 'swiggy';
      if (t.includes('myntra')) return 'myntra';
      if (t.includes('amazon')) return 'amazon';
      if (t.includes('zepto')) return 'zepto';
      if (t.includes('zomato')) return 'zomato';
      if (t.includes('blinkit')) return 'blinkit';
      if (t.includes('instamart')) return 'instamart';
      if (t.includes('flipkart')) return 'flipkart';
      return 'other';
    };
    const byMerchant = {};
    filtered.forEach(e => {
      const m = inferSource(e);
      if (m !== 'other') {
        const label = m.charAt(0).toUpperCase() + m.slice(1);
        byMerchant[label] = (byMerchant[label] || 0) + (e.amount || 0);
      }
    });
    return Object.entries(byMerchant).sort((a, b) => b[1] - a[1]);
  }

  /**
   * Get merchant deep link if available
   */
  function getMerchantLink(exp) {
    const src = (exp.source || '').toLowerCase();
    return MERCHANT_LINKS[src] || null;
  }

  global.FamilyOSExpenseUtils = {
    consolidateExpenses,
    getSpendingByCategory,
    getSpendingByMerchant,
    getMerchantLink,
    extractOrderKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
