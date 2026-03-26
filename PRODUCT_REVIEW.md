# FamilyOS PWA — Full Product Review

*Review date: March 2026 | Target: Indian families 25–40, home renovation, finances, tasks, coordination*

---

## 1. COMPLETE FEATURE INVENTORY

### Home
- **Hero section**: Time-based greeting (Good morning/afternoon/evening), family name, stats (Tasks count, Reminders count, Spent)
- **Notification prompt banner**: Enables notifications; hidden once granted/blocked
- **Today · Needs Attention**: Overdue tasks (red), due-today tasks (orange), today’s reminders (gold), tomorrow’s reminders (blue), kid events assigned to user, EMI due in ≤5 days
- **Quick actions**: Add Expense, Task, Reminder, Kids Event (depending on modules)
- **Pending Tasks**: Up to 5 open tasks, urgency-sorted (overdue → today → upcoming → no date); checkbox to mark complete; primary sees all household tasks; empty state “All caught up!” with Add Task
- **Upcoming Reminders**: Top 3 upcoming
- **Budget Snapshot card** (if interior module): Total budget, spent, left, progress bar
- **Recent Activity**: In-memory log of adds/edits/deletes (expense, task, reminder, event, EMI)
- **Nav badge**: Pending task count on Activities tab

### Finance (Interior + Loan)
- **Add/Edit Expense** (unified modal): Description, amount, category (Design/Materials/Labour/Furniture/Other), room (Living Room, Master Bedroom, Kids Room, Kitchen, Bathrooms, Foyer, General), Paid By (Me/Partner/Joint/Loan), date, notes
- **Receipt photo**: Camera/file picker, preview; NOT persisted to Firestore
- **Budget**: Total, progress bar, spent/left; Edit via Budget & Loan modal
- **Loan card**: Total loan, EMI, paid, outstanding, progress bar
- **Log EMI payment**: Amount, month, note; adds to `loanPaid` and creates expense entry with `isEmi:true`
- **Room breakdown**: Per-room totals, count, % of total
- **Expense filters**: All, Design, Materials, Labour, Furniture, Other
- **Search**: By description, room, notes
- **Monthly summary**: This month spend, vs last month %, entries count, top category
- **Edit/Delete expense**: Edit button opens add modal in edit mode; delete via confirm sheet

### Activities (Tasks + Reminders + By assignee)
- **Tasks tab**: Filters All, Pending, Done ✓, Me, Partner, Together
- **Task list**: Checkbox (toggle done), assignee tag, category tag, due date (+ time), overdue/today styling, edit button, delete button
- **Urgency grouping**: Overdue → Due Today → Next 3 Days → Upcoming → Done
- **Add/Edit task** (unified modal): Name, Assigned (Me/Partner/Together), Category (Interior/Kids/Finance/Home/Other), due date, time, Share with partner toggle (primary only)
- **Reminders tab**: Cal strip (15 days), filters Upcoming, Done, All, Me, Partner
- **Add/Edit reminder** (unified modal): Text, Assigned, Date, Time, Type (Payment/Meeting/Kids/Appointment/Other), Repeat (none/daily/weekly/monthly), Snooze, Share with partner
- **Reminder actions**: Dismiss (marks done ✓), edit, delete
- **Calendar strip**: Horizontal scroll, dots for dates with events (reminders/tasks/kid events)
- **jumpCalDate**: Click day → switch to All filter, scroll to that date’s items
- **By assignee**: Tree view by Primary owner / Partner / Together; Tasks, Reminders, Events per bucket; View Log opens Activity Log modal

### Kids
- **Child cards**: Name, age/grade, emoji, event count, task count
- **Add child**: Name, Age/Grade, emoji picker
- **Remove child**
- **Events list**: Name, for (child), assignee tag, date, notes, edit, delete
- **Add/Edit kid event**: Name, For (child dropdown), Assigned, Date, Notes, Share with partner

### More (Settings)
- **Invite Member**: Generate 6-char code, Copy, Share via WhatsApp (deep link with ?invite=CODE)
- **Add Profile Member**: Name, relationship (no login required)
- **Manage Members**: List with Perms button
- **Permissions modal**: Visibility (Expenses, Loan, Budget, Tasks, Reminders), Edit access, Delete access, Remove Member
- **Active Modules**: Toggle interior, loan, kids, groceries, vehicle, medical, staff, savings
- **Budget & Loan**: Interior budget, loan amount, EMI, amount paid
- **App Lock**: Face ID / Touch ID, 4-digit PIN, No lock
- **Notifications**: Enable; status shown
- **Check for updates** / **Force refresh**
- **Account**: Avatar, name, email, role; Sign Out

### Auth
- **Google Sign-In**: Popup (desktop) / Redirect (Safari/PWA)
- **Invite flow**: Join with code; deep link prefill
- **Setup**: Family name, your name → modules → config (budget/loan/savings) → security (faceid/pin/none)
- **PIN screen**: 4-digit unlock, biometric button, Sign out & switch account
- **Session**: Cleared on tab blur if lock enabled

### PWA
- **Service worker**: Cache-bust for HTML, version bump on deploy
- **Update banner**: Shown when new SW waiting; Update button triggers skipWaiting
- **Push notifications**: SW handles NOTIFY message; `notificationclick` opens `/`
- **manifest**: Not explicitly checked; meta tags for standalone

### Notifications & Alarms
- ** scheduleNotifications()**: Today/tomorrow reminders + kid events (assigned to user) → local notification
- **Alarm engine**: setTimeout-based alarms at reminder time; in-app banner with snooze
- **Task alarms**: Tasks with due+time scheduled as alarms
- **Repeat**: daily/weekly/monthly re-fire
- **Snooze**: 5/10/30/60 min, Next day

---

## 2. PARTIALLY BUILT / BROKEN

### Broken / Dead Code
| Item | Issue |
|------|-------|
| **Add Expense (no-id flow)** | Finance "+ Add" and empty state "+ Add First Expense" call `openExpenseModal()` / `openEditExpense()` with no arg. Function returns early — modal never opens. Home quick action uses `openModal('modal-expense')` directly, so Add works from Home but not from Finance page. |
| **modal-edit-expense, modal-edit-task, modal-edit-reminder** | HTML exists but never opened. `openEditExpense`, `openEditTask`, `openEditReminder` use unified modals (modal-expense, modal-task, modal-reminder). `saveEditExpense`, `saveEditTask`, `saveEditReminder` never called. |
| **renderCalendar()** | References `cal-month-label`, `cal-grid`, `cal-day-events` — these IDs don’t exist. `if(!monthLbl) return` and `if(!calGrid) return` cause a safe no-op. Full month calendar is never shown. |
| **Receipt photos** | `handlePhoto()` stores base64 in `pendingPhotos`. `saveExpense` patches set `_pendingPhoto` but payload never includes `photo`; `addDoc`/`updateDoc` don’t persist it. UI shows 📷 for expenses with `e.photo` but none ever have it. |
| **visibleToMe assignee logic** | `assignedToMe` has `(item.assigned==='self'&&myRole==='primary')` — self-assigned visible to primary. For secondary, `(item.assigned==='partner'&&myRole==='secondary')` — correct. Minor: “Me”/“Wife” legacy values normalized in resolveAssignee. |

### Incomplete / Placeholder
| Item | Issue |
|------|-------|
| **Groceries, Vehicle, Medical, Staff modules** | In setup picker and ALL_MODULES; no UI, no nav tab, no data. Selecting them adds to `activeModules` but nothing renders. |
| **Savings module** | Setup config (`savingsGoal`) stored in family doc; no dashboard, no progress UI. |
| **Edit Expense modal – Paid By** | Add modal: Me, Partner, Joint, Loan. Edit modal (dead): Me, Wife, Joint, Loan. Inconsistent. |
| **activity-log-list** | Activity Log modal exists; `actLog` is in-memory only, lost on refresh. |
| **edit-exp-by options** | Uses “Wife” in dead modal; live flow uses “partner”. |

### Hardcoded / Should Be Dynamic
| Item | Location |
|------|----------|
| `partnerName` | Resolved from first non-self member; assumes one “partner”. |
| `relEmojis` | Maps relationship labels to emoji; relationship options fixed. |
| Room list | Hardcoded 7 rooms; not configurable. |
| Category lists | Fixed for expenses (5), tasks (5), reminders (5). |
| Max 5 members | `Object.keys(FD.memberProfiles).length>=5` hard limit. |

---

## 3. DATA MODEL (FIRESTORE)

### Collections

#### `families/{familyId}`
| Field | Type | Written | Read |
|-------|------|---------|------|
| name | string | setup, — | hero, LS |
| modules | array | setup, saveModules | loadAndSubscribe |
| budget | number | setup, saveBudget | renderInterior, home |
| loan | number | setup, saveBudget | loan card |
| emi | number | setup, saveBudget | EMI modal, urgents |
| loanPaid | number | setup, saveBudget, logEmiPayment | loan card |
| savingsGoal | number | setup | — (not used in UI) |
| members | array | setup, join, removeMember | — |
| primaryOwner | string | setup | — |
| memberProfiles | map | setup, join, addProfileMember, savePerms, removeMember | permissions, members list |
| children | array | addChild, removeChild | kids page |
| createdAt | timestamp | setup | — |

#### `families/{familyId}/expenses`
| Field | Type | Written | Read |
|-------|------|---------|------|
| desc | string | saveExpense | list, search |
| amount | number | saveExpense, logEmiPayment | spent(), list |
| cat | string | saveExpense | filter, list |
| room | string | saveExpense | filter, room-list |
| by | string | saveExpense | list |
| date | string | saveExpense | filter, monthly |
| notes | string | saveExpense | list, search |
| addedBy | string | saveExpense | — |
| createdAt | timestamp | saveExpense | — |
| isEmi | boolean | logEmiPayment | — |
| photo | — | NOT persisted | — |

#### `families/{familyId}/tasks`
| Field | Type | Written | Read |
|-------|------|---------|------|
| name | string | saveTask | list, filters |
| assigned | string | saveTask | visibility, assignee tag |
| cat | string | saveTask | filter |
| due | string | saveTask | urgency, sorting |
| time | string | saveTask | display, alarms |
| done | boolean | saveTask, toggleTask | filters |
| sharedWithSecondary | boolean | saveTask | visibleToMe |
| addedBy | string | saveTask | — |
| createdAt | timestamp | saveTask | orderBy |

#### `families/{familyId}/reminders`
| Field | Type | Written | Read |
|-------|------|---------|------|
| text | string | saveReminder | list |
| date | string | saveReminder | filters, cal |
| time | string | saveReminder | display, alarms |
| type | string | saveReminder | tag color |
| repeat | string | saveReminder | display |
| snooze | string | saveReminder | alarm banner |
| assigned | string | saveReminder | visibility |
| done | boolean | dismissReminder | filters |
| sharedWithSecondary | boolean | saveReminder | visibleToMe |
| addedBy | string | saveReminder | — |
| createdAt | timestamp | saveReminder | — |

#### `families/{familyId}/kidEvents`
| Field | Type | Written | Read |
|-------|------|---------|------|
| name | string | addKidEvent | list |
| for | string | addKidEvent | list |
| assigned | string | addKidEvent | visibility |
| date | string | addKidEvent | list, cal |
| note | string | addKidEvent | list |
| sharedWithSecondary | boolean | addKidEvent | visibleToMe |
| addedBy | string | addKidEvent | — |
| createdAt | timestamp | addKidEvent | — |

#### `users/{userId}`
| Field | Type | Written | Read |
|-------|------|---------|------|
| familyId | string | setup, join, removeMember | auth flow |
| role | string | setup, join | permissions |
| name | string | setup, join | display |
| email | string | setup, join | display |

#### `invitations/{code}`
| Field | Type | Written | Read |
|-------|------|---------|------|
| familyId | string | openInviteModal | joinWithCode |
| code | string | openInviteModal | — |
| createdBy | string | openInviteModal | — |
| expires | number | openInviteModal | joinWithCode |
| used | boolean | joinWithCode | joinWithCode |
| usedBy | string | joinWithCode | — |
| familyName | string | openInviteModal | prefillJoinScreen |

### LocalStorage
- `familyos_pin`: PIN hash
- `familyos_security`: none | pin | biometric
- `familyos_session`: session validity
- `familyos_family_name`: display
- `pending_invite`: deep-link code
- `notif_sent`: Set of notification keys (max 50)

### UI-Only (Not Persisted)
- Activity log (`actLog`)
- Pending photos (`pendingPhotos`)

---

## 4. WHAT’S MISSING FOR PRODUCTION

### Likely Drop-off After 3 Days
1. **No receipts** — Photo capture exists but receipts aren’t saved; families expect proof for big spends.
2. **No offline** — Firestore has offline persistence, but app doesn’t surface “offline” state or retry logic.
3. **No splitting** — “Paid By” is single-select; no Splitwise-style split/share.
4. **No EMI alerts** — EMI due hint is on home; no push for “EMI due in X days.”
5. **Partner naming** — “Partner”/“Wife” hardcoded; no configurability.
6. **Activity log resets** — Activity lost on refresh; no audit trail.

### Friction
1. **5-member cap** — Multi-gen families hit the limit quickly.
2. **Fixed rooms** — No custom rooms for renovation projects.
3. **No subtasks** — Tasks are flat.
4. **No recurring tasks** — Only reminders support repeat.
5. **No categories for expenses** — Fixed list; no custom.
6. **Biometric** — Web Authn may fail; fallback to PIN not always clear.

### Table-Stakes in 2026
1. **Splitwise-like splitting** — Split by amount or %.
2. **Recurring expenses** — Rent, utilities, subscriptions.
3. **Export** — CSV/PDF for taxes/records.
4. **Better sharing** — Deep links to specific expense/task.
5. **Dark/light theme** — Dark only today.
6. **Multi-language** — English only.
7. **Receipt OCR** — Auto-fill amount/vendor from photos.

---

## 5. COMPETITIVE GAP

| Capability | Notion | Splitwise | Todoist | Google Tasks | WhatsApp | FamilyOS |
|------------|--------|-----------|---------|--------------|----------|----------|
| Collaborative docs | ✓ | — | — | — | — | — |
| Expense splitting | — | ✓ | — | — | — | ✗ |
| Task lists | ✓ | — | ✓ | ✓ | ✗ | ✓ |
| Recurring tasks | ✓ | — | ✓ | ✓ | — | ✗ |
| Subtasks | ✓ | — | ✓ | ✓ | — | ✗ |
| Rich media in tasks | ✓ | — | ✓ | — | ✓ | ✗ |
| Real-time sync | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Notifications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Offline | ✓ | Limited | ✓ | ✓ | Limited | Firestore only |
| Family-specific context | — | Groups | — | — | Groups | ✓ |
| Expense tracking | — | ✓ | — | — | — | ✓ (basic) |
| Invite flow | Link | Email | — | — | Link | Code + WA |
| Receipt capture | — | ✓ | — | — | ✓ | ✗ (broken) |

**Summary**: FamilyOS targets family coordination and renovation spend, but lacks expense splitting, recurring tasks, subtasks, and reliable receipt storage. Sync and permissions are strengths.

---

## 6. PRIORITY ROADMAP

### P0 — Must Fix Before New Users
| # | Item | Details |
|---|------|---------|
| 1 | **Add Expense broken** | `openEditExpense()` with no args returns early (`if(!e) return`) because it assumes edit. Finance "+ Add" and empty-state "Add First Expense" call `openExpenseModal()` / `openEditExpense()` with no id — modal never opens. Add `if(!id){ editMode=null; ... openModal('modal-expense'); return; }` like `openEditTask`. |
| 2 | **Receipt photos** | Add `photo` to expense payload in `saveExpense`; use Firebase Storage or base64 (with size limits). Use `window._pendingPhoto` / `pendingPhotos[0]`. |
| 3 | **Remove dead modals** | Delete `modal-edit-expense`, `modal-edit-task`, `modal-edit-reminder` and `saveEditExpense`/`saveEditTask`/`saveEditReminder`; or wire them if desired. |
| 4 | **Fix or remove renderCalendar** | Either add `#cal-month-label`, `#cal-grid`, `#cal-day-events`, `#cal-day-list`, `#cal-day-label` to a Calendar page, or stop calling `renderCalendar()` and remove dead code. |

### P1 — Core Loop
| # | Item | Details |
|---|------|---------|
| 1 | **EMI push notification** | Extend `scheduleNotifications` to send “EMI due in X days” when ≤5 days left. |
| 2 | **Persistent activity log** | Store in `families/{fid}/activityLog` subcollection or a log doc. |
| 3 | **Expense splitting** | Add Split By (Me/Partner/Joint) or custom split per expense. |
| 4 | **Partner display name** | Allow primary to set “Partner” label in More or member profile. |
| 5 | **Recurring tasks** | Add repeat (daily/weekly/monthly) to tasks like reminders. |
| 6 | **Offline indicator** | Use `onSnapshot` metadata or connection state; show sync status. |

### P2 — Delight
| # | Item | Details |
|---|------|---------|
| 1 | **Calendar page** | Expose full month view; wire `renderCalendar` to a visible page. |
| 2 | **Export** | CSV export for expenses (date range). |
| 3 | **Savings dashboard** | Use `savingsGoal`; show progress bar. |
| 4 | **Custom rooms** | Allow adding/editing rooms per family. |
| 5 | **Deep links** | `?task=id`, `?expense=id` to open specific item. |
| 6 | **Snooze for tasks** | Mirror reminder snooze for tasks with due+time. |

### P3 — Scale (100+ Families)
| # | Item | Details |
|---|------|---------|
| 1 | **Firestore rules** | Add security rules; currently not present. |
| 2 | **Member limit** | Increase or make configurable (e.g. plan-based). |
| 3 | **Invite expiry** | Extend beyond 24h or make configurable. |
| 4 | **Analytics** | Events for key actions (add expense, complete task, etc.). |
| 5 | **Error boundaries** | Handle Firebase errors and network issues more gracefully. |
| 6 | **Indexes** | Ensure compound indexes for common queries. |

---

*Generated from codebase analysis of index.html (~3336 lines) and sw.js (61 lines).*

### Gmail OAuth (FamilyOS Gmail Sync) — Client ID only; never commit Client Secret