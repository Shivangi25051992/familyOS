#!/usr/bin/env node
// Test: First Myntra email (order confirmation only - NO price breakdown)
const from = "Myntra Updates <updates@myntra.com>";
const subject = "Your MExpress+ Myntra Order Confirmation";
const body = `
Hello Prashant Chintanwar!

Sit Back And Relax. Your MExpress+ Order Is Confirmed
Date: Fri, 06 Mar

We know you can't wait to receive your order! The item(s) marked with MExpress+ tag will reach you extra fast. Our team is working hard to ensure quick delivery while maintaining all safety protocols.

Delivery by Sun, 15th Mar

Please Share Your Experience: Based on your purchase experience on the Myntra app/website, how likely are you to recommend Myntra to your friends and family?
`.trim().slice(0, 800);

const systemPrompt = "You are a receipt parser for an Indian family expense tracker. Extract expense data from email. Respond ONLY with valid JSON, no markdown, no explanation. If this is not a purchase email respond with {\"skip\":true}";
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
  if (!key) { console.error("Set OPENAI_API_KEY"); process.exit(1); }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key.trim()}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], max_tokens: 256 }),
  });
  const text = (await res.json()).choices?.[0]?.message?.content || "";
  console.log("--- AI response (email WITHOUT price breakdown) ---");
  console.log(text);
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      console.log("\n>>>", p.skip ? "SKIP - no expense" : "Would create:", p.merchant, "₹" + p.amount);
    } catch (e) { console.log("Parse err:", e.message); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
