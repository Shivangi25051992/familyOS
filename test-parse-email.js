#!/usr/bin/env node
/**
 * Test script: Parse a Myntra email with the same AI prompt used in sync.
 * Run: OPENAI_API_KEY=sk-... node test-parse-email.js
 */
const fs = require("fs");

const from = "Myntra Updates <updates@myntra.com>";
const subject = "Your MExpress+ Myntra Order Confirmation";

// Body constructed from the two Myntra email screenshots you provided
const body = `
Hello Prashant Chintanwar!

Sit Back And Relax. Your MExpress+ Order Is Confirmed
Date: Fri, 06 Mar

We know you can't wait to receive your order! The item(s) marked with MExpress+ tag will reach you extra fast.

Order number: 1324690-3911821-9935403
Delivery by Sun, 15th Mar

Quick Details:
- EXPRESS+ Allen Solly Notched Lapel Slim Fit Blazer - Size 42, Qty 1 - ₹3792.00 (Original ₹8427.00) - Saved ₹4635
- EXPRESS Mast & Harbour Notched Lapel Blazer - Size 42, Qty 1 - ₹2639.00 (Original ₹7999.00) - Saved ₹5360
- Cantabil Self Design Casual Blazer - Size 42, Qty 1 - ₹2944.00 (Original ₹9499.00) - Saved ₹6555

Price breakup:
MRP: ₹25925.00
Discount: -₹16550.00
Discounted Price: ₹9375.00
Platform Fee: ₹23.00
Total Amount: ₹9398.00
Bank CashBack: -₹750.00
Net Paid: ₹8648.00

You saved ₹17300.00 on this order.
Payment: VISA Paid by HDFC Credit Card ending in 3547

Delivering at: B305 Sri Balaji Serenity, Bangalore, Karnataka 560035
`.trim().slice(0, 800);

const systemPrompt =
  "You are a receipt parser for an Indian family expense tracker. Extract expense data from email. Respond ONLY with valid JSON, no markdown, no explanation. If this is not a purchase email respond with {\"skip\":true}";

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

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("Set OPENAI_API_KEY env var");
    process.exit(1);
  }

  console.log("Sending to OpenAI (gpt-4o-mini)...\n");
  console.log("--- Email summary ---");
  console.log("From:", from);
  console.log("Subject:", subject);
  console.log("Body (first 400 chars):", body.slice(0, 400) + "...\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key.trim()}`,
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

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";

  console.log("--- AI raw response ---");
  console.log(text);
  console.log("\n--- Parsed JSON (if valid) ---");
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      console.log(JSON.stringify(parsed, null, 2));
      if (parsed.skip) {
        console.log("\n>>> AI returned skip:true - would NOT create expense");
      } else {
        console.log("\n>>> Would create expense:", parsed.merchant, "₹" + parsed.amount, parsed.category);
      }
    } catch (e) {
      console.log("Parse error:", e.message);
    }
  } else {
    console.log("No JSON found in response");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
