#!/usr/bin/env node
/**
 * Automated sync flow test - runs without manual intervention.
 * Tests AI parsing with sample emails (Myntra with/without price).
 * Run: node test-sync-automated.js
 * Uses OPENAI_API_KEY from env or agentic-productivity/.env
 */
const path = require("path");
const fs = require("fs");

// Load OPENAI_API_KEY from agentic-productivity if not set
if (!process.env.OPENAI_API_KEY) {
  const envPath = path.join(__dirname, "../agentic-productivity/.env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const m = content.match(/OPENAI_API_KEY=(.+)/);
    if (m) process.env.OPENAI_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
  }
}

const systemPrompt =
  "You are a receipt parser for an Indian family expense tracker. Extract expense data from email. Respond ONLY with valid JSON, no markdown, no explanation. If this is not a purchase email respond with {\"skip\":true}";

async function parseEmail(from, subject, body, openaiKey) {
  const userPrompt = `Parse this email into JSON:
{
  "amount": number (rupees only, no symbol),
  "merchant": string (short name only, max 20 chars),
  "category": one of [Food, Groceries, Shopping, HomeServices, Travel, Utilities, Other],
  "description": string (max 40 chars, no personal info),
  "date": string YYYY-MM-DD,
  "source": string (swiggy|instamart|zepto|zomato|amazon|myntra|urbanclap|bank|other),
  "isEmi": boolean
}
From: ${from}
Subject: ${subject}
Body: ${body}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey.trim()}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 256,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const TEST_CASES = [
  {
    name: "Myntra order WITH price breakdown",
    from: "Myntra Updates <updates@myntra.com>",
    subject: "Your MExpress+ Myntra Order Confirmation",
    body: `
Hello Prashant Chintanwar!
Sit Back And Relax. Your MExpress+ Order Is Confirmed
Date: Fri, 06 Mar
Order number: 1324690-3911821-9935403
Delivery by Sun, 15th Mar
Quick Details:
- EXPRESS+ Allen Solly Blazer - ₹3792.00
- EXPRESS Mast & Harbour Blazer - ₹2639.00
- Cantabil Blazer - ₹2944.00
Price breakup:
MRP: ₹25925.00
Discount: -₹16550.00
Total Amount: ₹9398.00
Bank CashBack: -₹750.00
Net Paid: ₹8648.00
Payment: VISA HDFC Credit Card ending in 3547
`.trim().slice(0, 800),
    expect: { skip: false, amount: 8648, merchant: "Myntra" },
  },
  {
    name: "Myntra order WITHOUT price (confirmation only)",
    from: "Myntra Updates <updates@myntra.com>",
    subject: "Your MExpress+ Myntra Order Confirmation",
    body: `
Hello Prashant Chintanwar!
Sit Back And Relax. Your MExpress+ Order Is Confirmed
Date: Fri, 06 Mar
We know you can't wait to receive your order!
Delivery by Sun, 15th Mar
Please Share Your Experience: how likely are you to recommend Myntra?
`.trim().slice(0, 800),
    expect: { skip: true },
  },
];

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OPENAI_API_KEY not set. Set env or add to agentic-productivity/.env");
    process.exit(1);
  }

  console.log("=== Gmail Sync Automated Test ===\n");
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    process.stdout.write(`[${i + 1}/${TEST_CASES.length}] ${tc.name}... `);
    try {
      const parsed = await parseEmail(tc.from, tc.subject, tc.body, key);
      if (!parsed) {
        console.log("FAIL (no valid JSON)");
        failed++;
        continue;
      }
      const ok =
        (tc.expect.skip === undefined || (tc.expect.skip ? parsed.skip === true : !parsed.skip)) &&
        (tc.expect.amount === undefined || parsed.amount === tc.expect.amount) &&
        (tc.expect.merchant === undefined || (parsed.merchant && parsed.merchant.toLowerCase().includes(tc.expect.merchant.toLowerCase())));
      if (ok) {
        console.log("PASS");
        if (parsed.skip) console.log("      → AI correctly skipped (no amount)");
        else console.log("      → AI parsed:", parsed.merchant, "₹" + parsed.amount);
        passed++;
      } else {
        console.log("FAIL");
        console.log("      Expected:", tc.expect);
        console.log("      Got:", parsed);
        failed++;
      }
    } catch (e) {
      console.log("FAIL:", e.message);
      failed++;
    }
  }

  console.log("\n--- Result ---");
  console.log(`Passed: ${passed}/${TEST_CASES.length}`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    process.exit(1);
  }
  console.log("All tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
