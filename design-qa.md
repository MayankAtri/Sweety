# Sweety redesign QA — 8 November 2026

final result: passed

## Visual evidence and comparison setup

- Source visual truth: `docs/design-research/concept-combined-v2-glow.png` (1487 × 1058). This is the user-approved option 3 layout, option 1 palette, refined with the supplied Glow reference.
- Implementation: http://localhost:5173, production Vite build; `docs/screenshots/redesign/overview-desktop.jpg` (1425 × 1013). Requested browser viewport: 1440 × 1024 CSS pixels. Native IAB captures include a scaled viewport/scrollbar; device scale factor was not independently measured.
- Same state: demo patient, 8 November 2026, morning 96, breakfast 138, lunch selected and unrecorded, dinner missing, average 117.0.
- Full side-by-side evidence: `docs/screenshots/redesign/comparison-full.jpg`. Both artifacts proportionally normalized to a maximum 1400 × 1000 pane, without stretching; labels above each pane. Comparison is composition-level, not a pixel-diff claim.
- Focused side-by-side evidence: `docs/screenshots/redesign/comparison-detail.jpg`, comparing slot controls, value field, hint and primary action from those normalized panes. Minor crop differences are visible and do not represent layout defects.
- Additional rendered evidence: `auth-desktop.jpg`, `reports-desktop.jpg`, `history-desktop.jpg`, `overview-mobile.jpg`, `history-mobile.jpg`, `reports-mobile.jpg`, `edit-mobile.jpg`, `delete-mobile.jpg`, `overview-tablet.jpg`, `overview-1024.jpg`, `history-320.jpg`, all under `docs/screenshots/redesign/`.

## Findings and comparison history

1. Initial comparison: blocked by P2 typography/density drift. `comparison-before.jpg` showed undersized slot labels, values and supporting text, and daily rows taller than the reference. Increased desktop display weight/size, navigation, slot labels, reading values and hints; reduced desktop reading-row minimum height from 73 to 65px.
2. Responsive refinement: reduced mobile heading/section spacing and tile height; retained readable labels and vertical scrolling. Added an explicit account-menu accessible name when the user's name is hidden on mobile. Corrected focus when selecting an unrecorded row after viewing an already-recorded slot.
3. Revised full and focused comparisons were reopened and inspected. No actionable P0/P1/P2 mismatch remains. Mobile/tablet/laptop captures were also reopened. Narrow history rows wrap rather than hiding actions; dialogs remain within the viewport with scrolling available.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts/typography | Georgia display headings and Helvetica Neue/Arial controls preserve the serif/sans hierarchy. Desktop hierarchy was corrected after comparison. The generated mock has no authoritative font metadata; exact font identity/antialiasing is not asserted. Small text remains visually lighter and slightly more compact than the generated reference: P3 refinement only. |
| Spacing/layout | Top navigation, week strip, two-column entry/day layout, 2×2 slot controls, large value field and three summary values match the approved composition. At ≤900px the content becomes one column. Mobile uses a second navigation row and stacked weekday labels. |
| Color/tokens | Ivory `#faf9f3`, forest `#102817`, citron `#e7f581`, sage surfaces and subdued borders consistently replace the previous cobalt styling. Active selection uses both border/check and fill. Errors retain a distinct red treatment. |
| Image/assets/icons | No photographic/illustrative content is needed by this target. Existing Lucide droplet, sunrise, sun, utensils and moon icons remain crisp vector library assets; no custom SVG illustration substitutions. Text wordmark and initial avatar follow the source. Exact generated icon strokes are not claimed. |
| Copy/content | All four real slot labels, units, 40–600 bounds, missing states, demo values and one-decimal averages are correct. No generated clinical advice or unsupported features entered the product. |

## Intentional product adaptations

- Added previous/next week and Today controls alongside the arbitrary-date picker; the concept did not completely specify historical navigation.
- Retained delete controls, logout, validation, loading/error states and edit dialogs omitted from the static mock.
- Unrecorded tiles explicitly say “Not recorded”; recorded slots offer editing instead of silent overwriting.
- The live footer includes the server timezone; summary units appear in a common caption. These are useful data-context differences.
- Reports, authentication, History and mobile have no separate approved pixel target. They inherit this design system while preserving existing functionality. The chart remains below the three report summaries and retains the exact-data table and missing-reading gaps.

## Browser checks and limits

In-app browser: desktop 1440, laptop 1024, tablet 768, mobile 390 and narrow 320 requested viewport widths. Native capture dimensions vary with the app's presentation scale; images are responsive evidence, not physical-device captures.

Verified demo login, mobile registration into a synthetic local account, empty daily values, required-value focus/error, inline create 130, edit to 145, daily/MTD report refresh, single-point chart and expanded data table, history, delete confirmation and Escape dismissal, session persistence after reload, logout, week navigation across October/November and return to Today. Demo data was not mutated. The synthetic QA reading remains local. Confirmed deletion, user isolation, conflicts, full-day limits and pagination are covered by real API/HTTP tests; this redesign pass did not repeat every earlier browser fault-injection/pagination scenario. Browser console query returned no captured error/warning entries.

Physical iOS/Android, Safari/Firefox, formal screen-reader audit, 200% text zoom and hosted HTTPS remain unverified. No claim that all possible environments or paths have been tested.

## Implementation checklist

- [x] Apply approved composition and tokens across app screens.
- [x] Preserve integrated API behavior and scoped feature set.
- [x] Correct comparison findings and recapture.
- [x] Inspect responsive layouts and primary interactions.
- [x] Run frontend, real PostgreSQL, HTTP and Docker checks.
- [x] Save comparison artifacts, test report and append-only handoff.

## Follow-up polish

P3: a future font pass could further match the generated reference's small-text optical weight. No additional font download or runtime dependency was introduced for an unverifiable font identity.
