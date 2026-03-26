# Cursor Implementation Notes — FamilyOS Sprint 1–5

**Read this before implementing. These override or clarify the main brief.**

---

## 1. API Key (Sprint 5) — CRITICAL

- **NEVER hardcode** the Anthropic API key in `index.html` or any source file.
- Store the key in **localStorage only** (e.g. `familyos_anthropic_key`).
- Add a Settings UI: "Receipt OCR" section → API key input (type="password") → Save to device.
- Add a clear TODO in code: `// TODO: Move OCR/parse API calls to Cloud Function before public launch. Key must never be in client bundle.`
- If API key is not set → OCR and WhatsApp parse are skipped silently; core flows (photo attach, paste) still work.

---

## 2. Sprint Order — COMMIT AFTER EACH SPRINT

- **Do not** implement all 5 sprints in one pass.
- Implement **one sprint at a time**, then:
  1. Run the relevant parts of the regression checklist.
  2. **Commit** with a message like `Sprint 1: P0 bug fixes` or `Sprint 2: Core habit loop`.
  3. Proceed to the next sprint.
- The regression checklist is designed to catch issues **between** sprints, not only at the end.

---

## 3. Sprint 2.1 — Recurring Tasks (Trickiest)

- The **create-new-on-complete** pattern for recurring tasks is the most error-prone.
- If you get confused or hit edge cases, **tackle Sprint 2.1 last within Sprint 2**.
- Suggested Sprint 2 order: 2.2 (EMI push) → 2.3 (Partner names) → 2.4 (Expense splitting) → **2.1 (Recurring tasks)**.
- Test recurring logic thoroughly: weekly → mark done → new task due in 7 days; monthly → next month same date; non-recurring unchanged.

---

## Quick Reference

| Topic        | Rule                                                                 |
|-------------|----------------------------------------------------------------------|
| API key     | localStorage only, never in source, TODO for Cloud Function          |
| Sprints     | One at a time → regression check → commit → next                    |
| Recurring   | Do 2.1 last in Sprint 2 if it causes confusion                       |
