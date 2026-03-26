# Myntra Gmail Sync — Fix & User Value

## Sync Window
- **First sync:** Last **60 days** of emails
- **Subsequent syncs:** 2hr overlap before last sync (catches new emails)
- **Max per sync:** **50 emails** (up from 25)

## 1. How to Sync Myntra Emails

### Step 1: Connect Gmail
1. Open FamilyOS → **More** (Settings)
2. Scroll to **Gmail Auto-Capture**
3. Tap **Connect Gmail** → Authorize with your Google account
4. Ensure **Myntra** is enabled (toggle ON) in the services list

### Step 2: Sync
1. Tap **Sync now**
2. Wait 10–30 seconds (depends on email count)
3. Check **Home** — pending expenses appear in the inbox card above "Pending Tasks"

### Step 3: If You See "0 new" — Debug
1. Tap **Debug sync** (next to Sync now)
2. Open browser DevTools (F12) → **Console** tab
3. Click Debug sync again
4. Look for each Myntra email:
   - `skip: "wrong_sender"` → Myntra sender not in our list (share the `from` value)
   - `skip: "already_exists"` → Email was processed before. Disconnect + reconnect to re-process
   - `skip: "no_body"` → Body extraction failed
   - `skip: "ai_skip"` → AI found no amount. Check `body` — does it contain "₹" or "Net Paid" or "Amount Paid"?

### Step 4: Share Debug Output (if still broken)
Copy from console: `from`, `subject`, `body` (first 400 chars) for one Myntra email. That helps fix extraction.

---

## 2. Smart Vendor → Category Mapping

| Vendor | Category |
|--------|----------|
| Swiggy, Zomato | Food |
| Instamart, Zepto, Blinkit, BigBasket | Groceries |
| Myntra, Nykaa | Clothes |
| Amazon, Flipkart, Croma | Shopping |
| UrbanClap | HomeServices |
| Bank alerts | Utilities or Other |

## 3. Fixes Applied (for Myntra)

| Fix | What |
|-----|------|
| **More sender addresses** | Added orders@myntra.com, support@myntra.com, mailer@myntra.com |
| **More price signals** | "Amount paid", "Paid:", "Total:", "Order amount", "debited", "charged" |
| **AI prompt** | Told AI to check subject for price (e.g. "Order #123 - ₹8648") |

---

## 4. Myntra Email Reality

**Some Myntra emails have NO price** — e.g. "Order confirmed" with just delivery date. In that case:
- AI correctly returns `skip` (we don't create fake expenses)
- Myntra may send a **second email** with invoice/payment details — that one should have the amount
- If you only ever get the first email, we can't extract amount. You'd need to add manually.

---

## 5. What Users Care About (Level of Information)

| Priority | Field | Why |
|----------|-------|-----|
| **1** | Amount (₹) | Core value — "how much did I spend?" |
| **2** | Merchant | Context — "was it Swiggy or Myntra?" |
| **3** | Category | Budgeting — "Food vs Shopping" |
| **4** | Date | Monthly reports, trends |
| **5** | Description | Nice to have — "2 shirts, 1 jeans" |

**Minimum useful:** Amount + Merchant. Category can be auto-assigned (e.g. Myntra → Shopping).

---

## 6. What Would Be Really Useful

### For the inbox (Accept/Dismiss flow)
- **One-tap confirm** — Don't make user edit. If AI got amount + merchant + category right, one tap adds to expenses.
- **Quick edit** — If amount is wrong, tap to edit before confirming (optional).
- **Accept all** — Already there. Batch confirm when you trust the extraction.
- **Smart defaults** — Myntra → Shopping, Swiggy → Food. User rarely needs to change category.

### For the expense after confirm
- **Room** — For renovation tracking, "Which room?" — default "General" is fine for non-interior.
- **Paid by** — Me / Partner / Joint. Useful for families. Default "Me" is ok.
- **Split** — "Split with partner?" — future enhancement.

### For usefulness
- **Proactive** — "You have 3 expenses from email — confirm them?" notification.
- **Summary** — "This week: ₹X from Swiggy, ₹Y from Myntra" — helps user verify.
- **No friction** — Sync runs in background; user just confirms when they open app.

---

## 7. Summary

**To sync Myntra:** Connect Gmail, enable Myntra, Sync now. Use Debug sync if 0 new.

**What users care about:** Amount first, then merchant, then category. Date is automatic.

**What's useful:** One-tap confirm, Accept all, smart category defaults, minimal editing.
