# AI Natural Language Entry — Roadmap

## Overview

Users describe transactions in plain language (text or voice). AI parses the intent, generates a structured draft, and the user confirms before it saves to the ledger.

```
User input (text / voice)
        ↓
  AI parse layer (DeepSeek / Claude)
        ↓
  Structured draft (Transaction JSON)
        ↓
  Confirmation card shown to user
        ↓
  User confirms → existing API → Ledger
```

---

## Phase 1 — Web Text Input (MVP)

**Goal:** User types a sentence on web, AI creates the correct transaction draft, user confirms.

### What to build

- `POST /api/ai/parse` endpoint — accepts natural language + ledger context, returns structured draft
- AI Quick Entry input box on web
- Confirmation card UI — shows AI's interpretation, all fields editable
- On confirm, call existing transaction / invoice / bill API

### Context sent to AI per request

The AI needs the user's specific ledger data to classify correctly:

- `accounts` — bank account list
- `categories` — income and expense categories
- `contacts` — customers and suppliers
- `chartOfAccounts` — chart of accounts
- `settings.gstEnabled` — whether GST applies

This data is small enough to include directly in the prompt. No RAG needed.

### Example inputs and expected output

| User input | AI output |
|-----------|-----------|
| "Bought office supplies at Officeworks for $85, paid with CommBank" | type: expense, amount: 85, account: CommBank, category: Office Supplies |
| "Sent ABC Company a $2,000 invoice, 30-day payment terms" | type: income, entryMode: invoice, amount: 2000, contact: ABC, paymentTerms: net_30 |
| "Transferred $500 from CommBank to petty cash" | type: transfer, amount: 500, accountId: CommBank, accountToId: petty cash |

### Handling ambiguity

- **High confidence** → generate draft directly
- **Low confidence** → generate draft, flag uncertain fields for user to fill in
- **Critical info missing** → AI asks one clarifying question before drafting

### Key principle

Never write directly to the ledger. Always show the confirmation card first. Users must approve before anything saves.

---

## Phase 2 — Mobile Voice Input

**Goal:** User speaks on mobile, same AI parse flow, mobile-optimised confirmation UI.

### What to build

- Voice-to-text via `expo-speech` or system speech API
- Voice → text → same `/api/ai/parse` endpoint
- Bottom sheet confirmation card (single-hand friendly)
- Quick approve / edit / reject actions

---

## Phase 3 — Smart Enhancements

**Goal:** AI gets smarter over time by learning from the user's own history.

### What to build

- Analyse frequent contacts, amounts, and categories from transaction history
- Real-time suggestions as user types
- Batch entry: "Last week I had three expenses: …"

---

## Technical Decisions

### AI model

- **Primary:** DeepSeek — lower cost, strong Chinese language support
- **Fallback:** Claude API — stronger reasoning, slightly higher cost
- Both support function calling; implementation is identical either way

### Parse method: Function Calling

Define tools for each transaction type and let the AI pick the right one:

```
tools: [create_expense, create_income, create_transfer, create_invoice, create_bill]
```

More reliable than asking the AI to return raw JSON.

### GST calculation

AI handles intent recognition only. All GST calculations go through the existing `accounting-core` logic — no risk of AI getting the maths wrong.

### New API surface

```
POST /api/ai/parse    ← only new endpoint needed
```

Everything else reuses existing routes. No changes to core ledger logic.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| AI misclassifies category or account | Confirmation card — user can edit any field before saving |
| Account name fuzzy match fails | Return candidate list for user to pick from |
| Slow network affects UX | Loading animation + optimistic UI |
| AI gets GST wrong | GST calculation delegated to `accounting-core`, not AI |

---

## Implementation Order

1. Write system prompt — structure ledger context into AI-readable format
2. Build `POST /api/ai/parse` endpoint
3. Web: add input box + confirmation card UI
4. Mobile: add voice input + bottom sheet confirmation
5. Smart enhancements based on usage patterns
