// Booth settings, shared by server.js and the kiosk page (so test mode works with no server running).
const BOOTH = {
  TICKETS: 400,              // people, not groups. Selling stops at this many (or when the slots run out)
  PRICE: 50,                 // ₱ per player, paid at the desk before the signup. SET THIS: placeholder
  MIN_PARTY: 4,              // smallest group (test mode and ASSIST mode allow any size, even 1)
  MAX_PARTY: 7,             // ASSIST mode (hold Ctrl+Alt, type NEXUS) lifts this to ASSIST_MAX.
  ASSIST_MAX: 20,            // Assist groups are free and don't count toward TICKETS or the sales totals
  SLOT_MIN: 25,              // one game + the 2 min cleanup. Tune after the dry run (the GM panel shows real run times)
  GRACE_MIN: 2,              // a called group has this long to show up, then the next group goes
  // booth hours per day (local time). The last slot starts SLOT_MIN before close. SET THESE: placeholders
  DAYS: [
    { date: '2026-10-05', open: '09:00', close: '17:00' },
    { date: '2026-10-06', open: '09:00', close: '17:00' },
    { date: '2026-10-07', open: '09:00', close: '17:00' },
    { date: '2026-10-08', open: '09:00', close: '17:00' },
    { date: '2026-10-09', open: '09:00', close: '17:00' },
  ],
};
if (typeof module !== 'undefined') module.exports = BOOTH;
