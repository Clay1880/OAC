# OAC Pre-Order App — Design

## Intent and why

The college's Open Area Canteen (OAC) is overwhelmed at the end of the 1 pm class. Students get about 45 minutes of break, and everyone arrives at the counter at once. Ordering is fully manual today: the student walks up, tells the order, pays, and waits for the food.

This app lets students order **while still in class** and choose **when they will come to collect**. Staff can then prepare orders ahead and spread pickups across the break instead of facing one crowd. The success measure is a shorter, calmer queue at the counter during the break.

Real use: ~2500+ students at one college. This is not a demo; it must hold up under a burst of hundreds of orders in the minutes before and during the break.

## Core flow

1. **Student** signs in, browses the menu, builds an order, and picks a pickup slot.
2. The order gets a **unique order ID** (short, human-readable, easy to show on a phone).
3. **Staff** see the order arrive live, accept it, prepare it, and mark it **ready**.
4. Student receives a **"ready to collect" notification**.
5. Student goes to the OAC, shows the order ID, staff verify it, hand over the food, and the student **pays at the counter**.

Payment is **not** handled online. There is no payment gateway. Staff record that an order was collected and paid.

## Roles

- **Student**: places and tracks orders.
- **Staff**: use a **phone at the counter** to see and process orders. The staff UI must be designed phone-first.
- **Admin**: manages the menu, slot limits, and the defaulter list, and can see all student details.

## Accounts

- Everyone has a college email. Sign-up collects **college email, phone number, and registration number**.
- Email must be verified so only real students get in (verification method is my call — see below).
- **Students register themselves** on the website.
- **Staff do not self-register.** The admin creates each staff login (ID + password) from the admin console and hands the credentials to the staff member.
- **The admin account is provisioned directly** with login credentials given to the admin (no self-registration).

## Pickup slots

- Pickup is by **time slot**. Each slot has a **fixed maximum number of orders**, set by admin.
- A full slot shows as unavailable so students choose another.
- Students can only pick upcoming slots; ordering for a slot closes shortly before it starts so staff have prep time.

## Defaulters

- If a student does not collect their order, staff **hold it for 15 minutes after the slot**, then it is **marked unpaid and the student is flagged as a defaulter**.
- **Defaulters are blocked from ordering** until they pay.
- If a flagged student arrives later, staff give them the order if it is still available, record payment, and **remove the flag**.
- Admin can see defaulter details: name, phone, registration number, unpaid amount.

## Decided technology (user chose Next.js and PWA; the rest the user handed to me)

- **Next.js** (user's choice), **installable PWA** that feels like an app on the phone home screen (user's choice).
- My calls: TypeScript, Tailwind CSS, Supabase (Postgres, auth, realtime), Web Push for notifications. On iPhones push only works once the app is added to the home screen.

## Design quality bar

The user explicitly does **not** want it to look "vibe-coded". Build it like a professional frontend engineer:

- A deliberate visual identity: considered typography, spacing, color, and motion; no default-component-library look and no generic template styling.
- Polished states everywhere: loading, empty, error, full slot, offline.
- Mobile-first throughout, fast, and accessible.
- No mockups were requested; the builder should make strong design decisions without a design review round.

## Goals

- Cut the break-time crowd by shifting ordering and prep before the break.
- Fast, trustworthy staff workflow on a phone.
- Clear unique ID verification at handover.
- Scale to 2500+ students with a burst of simultaneous orders; slot limits must hold under concurrency (no overbooking).

## Non-goals

- Online payments.
- Delivery.
- Multiple canteens.

## Anti-goals (failure even if it technically works)

- Looking like a default or AI-generated template.
- Slots overbooking under load.
- Staff screen that is slow or hard to use one-handed at a busy counter.
- Students able to order while flagged as defaulters.

## My calls (not discussed; the user can override)

- Email verification via one-time code or Google sign-in limited to the college domain.
- Slot length around 5–10 minutes; ordering closes a few minutes before each slot.
- Admin can manually add, edit, and mark menu items sold out.
- Students can cancel an order only before staff accept it.
- Staff flag no-shows from their screen after the 15-minute hold.
- Staff/admin sign in with a login ID (username) and password; internally the ID maps to a synthetic email. Admin can reset a staff password or deactivate a staff account. Staff must change the temporary password on first login.

## Left to the builder

- Database schema, API design, and exact slot-capacity concurrency mechanism.
- Component structure, visual identity details, and notification wording.
- Hosting and deployment choices that suit the scale.
