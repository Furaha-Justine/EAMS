# EAMS – Emergency and Ambulance Management System

Interactive prototype for the AUCA Requirements Engineering project (Group 6, Kigali, Rwanda).
One system connects **callers, dispatchers, ambulance crews, hospital staff and the system admin** around the four core activities:

**emergency request → ambulance allocation → routing → hospital notification**

## Run it

No build step and no dependencies (only the Inter font from Google Fonts).

- **Easiest:** double-click `index.html` (it works from `file://`).
- **Or serve the folder** (recommended for multi-tab testing):
  ```bash
  cd EAMS
  python3 -m http.server 8000
  # open http://localhost:8000
  ```

All data lives in one shared in-memory store saved to `localStorage`. Open the app in **several tabs** (e.g. caller in one, dispatcher in another) and changes appear live in every tab. Use **Reset demo data** on the start page to reload the sample data.

### Demo accounts (password `demo123` for all)

| Role | Username |
|---|---|
| Dispatcher | `dispatcher` |
| Hospital staff | `nurse.chuk`, `nurse.kfh`, `nurse.kib`, `nurse.mas` |
| Admin | `admin` |
| Ambulance crew | no password – choose a unit (e.g. A-03) on the shift-start screen |

Five wrong passwords lock an account ("Account locked"); the admin can unlock it in *Manage data → Users*.

## Demo flow

Click **Run full demo** on the start page. It resets the data and walks one emergency (EMR-0427) through every role automatically, highlighting each element before it clicks it (Pause / Next / Exit in the panel bottom-left). To do it by hand:

1. **Caller** – *Request ambulance* → Accident, condition, 2 patients, GPS location → *Send Request*.
2. **Dispatcher** – the request tops the queue (Critical first) → *Verify* → *Allocate*: A-03 is "Suggested – nearest" → *Assign A-03* → 60 s countdown.
3. **Crew** – start the shift as A-03 → green alert → *Accept* → navigation with moving marker and turn card.
4. **Caller** – *Track ambulance*: moving marker, ETA countdown, hospital notified.
5. **Hospital (CHUK)** – incoming-patient card with ETA and 3-minute response timer → *Accept patient* (a bed is reserved).
6. **Crew** – *At the patient* → vitals and first aid → *Start transport* ("Hospital ready – confirmed") → *Arrived at hospital* → *Mark patient handed over*.
7. **Dispatcher** – *Close case* (enabled only now) → full read-only case log.
8. **Crew** – *Return to Available*.

The floating **role switcher** (bottom-right) jumps between roles at any time while keeping the shared state.

**Things to try**
- Hospital *Cannot accept* → the crew sees "Hospital declined – rerouting to King Faisal Hospital".
- Crew *Decline*, or let the 60 s run out → the next nearest ambulance is offered automatically.
- Assign units until none are free, then verify another request → the waiting list shows the caller's position; *Assign as soon as free* assigns it the moment a unit returns.
- Dispatcher *Register phone request* (912 calls) with location typed or clicked on the map.
- Caller EN/RW language toggle, History and Profile (emergency contact and SMS/phone fallback).
- Admin: add or disable users, ambulances and hospitals live; Reports with *Export CSV*; Audit log (views and changes).

## Business rules (enforced in `js/store.js`)

- Verify before assign; Critical first; the nearest available (ALS preferred for Critical) unit is suggested first.
- One ambulance serves one emergency; out-of-service or disabled units are never offered.
- No crew answer in 60 s (or decline) → next nearest unit is offered automatically.
- No free unit → waiting list (priority, then time); the caller sees their position; the dispatcher is alerted when a unit frees up.
- Nearest hospital with emergency care and free beds; full hospitals are greyed out; a declining hospital triggers automatic rerouting.
- Only the crew can mark the handover; only then can the dispatcher close the case.
- Every change is written to the case log and audit log with user and time. Hospital staff only see patients routed to their hospital, crews only their own assignment, and the caller only their own requests.

## Project structure

```
index.html            single page, hash routing (#/caller/home, #/dispatcher/dashboard, …)
css/styles.css        design tokens + all component styles
js/icons.js           inline Lucide-style SVG icons
js/i18n.js            caller strings in English / Kinyarwanda
js/store.js           shared store: seed data, persistence, business rules, timers
js/components.js      Button, Badge, Card, Header, BottomNav, Timeline, Stepper, Modal, Toast, Shell…
js/map.js             MapView – stylised SVG map of Kigali with animated markers
js/views/*.js         landing, caller, dispatcher, crew, hospital, admin screens
js/demo.js            "Run full demo" guided walkthrough
js/app.js             router, event delegation, live timers, role switcher
```

Views return HTML strings. Buttons declare `data-action="…"` and the router dispatches the action to the active view, so every screen re-renders from the store whenever data changes, in this tab or another one. Live timers (waiting time, 60 s countdown, ETA, 3-minute hospital timer) and marker movement update every second without a re-render.

## Notes

- The map is a stylised SVG of Kigali (a 0–100 grid where 1 unit = 100 m); distances and ETAs are computed from it.
- The demo clock starts at 10:44 AM after a reset, so EMR-0427 shows "received 10:42 AM".
- The Kinyarwanda translations are a draft and should be reviewed by a native speaker.
- Calls and SMS are simulated (toasts).
