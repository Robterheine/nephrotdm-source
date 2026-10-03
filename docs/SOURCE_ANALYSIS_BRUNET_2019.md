# Source analysis: Brunet 2019 (IATDMCT second consensus on tacrolimus), what the app takes from it

Brunet M, van Gelder T, Åsberg A, et al. Ther Drug Monit 2019;41(3):261–307. Read on 3 October 2026 from the PDF supplied by the owner
(journal pages cited below). Paraphrased, not quoted. Only the kidney sections were used for windows.

## What the report says (adult kidney, twice-daily immediate-release tacrolimus)

| Statement | Page | Grade |
|---|---|---|
| Low immunological risk, tacrolimus with IL-2R blocker induction, mycophenolate and glucocorticoids: trough (C0) 4–12 ng/mL, preferably above 7 | 263, 273 | A, I |
| With everolimus (and induction): C0 4–7 ng/mL in months 0–2, 2–4 afterwards | 263, 273 | B, II |
| Higher immunological risk: targets may be higher; no numbers | 263, 273 | B, II |
| A minimal AUC0–12h threshold of about 150 ng·h/mL may be proposed (twice-daily); it rests on two small studies (157 vs 215 ng·h/mL with and without acute rejection; an efficacy threshold of 150 for biopsy-proven acute rejection) | 263, 270–271 | B, II |
| AUC0–12h/C0 ranges, twice-daily, derived from AUC–C0 correlations in large adult populations: C0 3–7 ↔ 75–140; 5–10 ↔ 100–190; 8–12 ↔ 140–210; 10–15 ↔ 180–270 ng·h/mL | 271 | derived, not outcome-tested |
| Time-adjusted AUC ranges were also proposed (0–3 months, 3–12 months, later); the values are in the cited source (ref. 69), not on these pages | 271 | derived |
| It is not possible to recommend a single target concentration range | 271 | |

ng/mL equals µg/L and ng·h/mL equals µg·h/L, so the numbers enter the app unchanged.

## Reference 69 read (Saint-Marcoux 2013, 3 October 2026)

Saint-Marcoux F, Woillard JB, Jurado C, Marquet P. Ther Drug Monit 2013;35(3):322–327. Retrospective analysis of 2030 routine dose-adjustment requests (1000 adult
kidney recipients, 21 centres, immediate-release tacrolimus), AUC estimated by Bayesian models. Regression of AUC on C0 per period (Table 2): 0–3 months
AUC = 24.9 + 16.5·C0 (r² 0.76); 3–12 months 39.4 + 14.2·C0 (0.64); after 12 months 34.2 + 13.3·C0 (0.67). Regression-derived AUC ranges (µg·h/L):

| C0 (µg/L) | 0–3 mo | 3–12 mo | >12 mo | combined (the consensus's range) |
|---|---|---|---|---|
| 3–7 | 75–140 | 80–140 | 75–130 | 75–140 |
| 5–10 | 110–190 | 110–180 | 100–170 | 100–190 |
| 8–12 | none | 150–210 | 140–200 | 140–210 |
| 10–15 | 190–270 | 180–250 | none | 180–270 |

The consensus's pairs are exactly the combination (lowest lower bound, highest upper bound) of the three periods, which the app computes rather than types, and a test
compares every cell with this table. Also in the paper: the 2009 consensus suggested an AUC of 150–200 µg·h/L; Undre (day 2) found 157 vs 215 with and without later
rejection and suggested over 200 as discriminatory; Uchida proposed 150 (first 4 weeks) and 120 (weeks 4–8) for AUC0–4h; Scholten proposed 210 (weeks 2–6) and 125 (weeks 6–52).
The paper notes that the 3–7 range of the Symphony study was in practice 5–8. At the 150 threshold, the regressions put C0 at about 7.6 (0–3 months) to 8.7 (after 12 months),
in line with the consensus's preference for troughs above 7.

The paper gives no AUC range for a 4–12 trough, so the standard window's upper bound of 210 stays the app's own choice (it equals the 3–12 month range for troughs of 8–12
and Scholten's weeks 2–6 target).

## What the app does with it

- `windowStandard` = adult kidney, standard risk: **trough 4–12 µg/L, AUC0–12h 150–210 µg·h/L**. Trough range: the graded recommendation. AUC lower
  bound 150: the consensus minimum. **AUC upper bound 210: the app's own choice**, the top of the AUC range the report pairs with a trough of 8–12.
  The report gives no AUC range for the 4–12 trough group, so this pairing is ours and is stated as such in the dialog. The owner can change it in one
  place (`windowSets` in `src/tacrolimus.js`).
- The everolimus sets carry a trough window only (the report gives no AUC range for them).
- The trough-matched AUC ranges: 14 buttons in a grid (four trough ranges by 0–3 months, 3–12 months, after 12 months and all periods), from Saint-Marcoux 2013 Table 2, labelled "derived".
- The windows are fields the user can edit or clear. A cleared window means intervals without probabilities; the engine applies no window of its own.
- Not included: higher-risk targets (the report gives no numbers; use your protocol), liver/heart/lung/bone-marrow targets (not the app's scope).
- The report says nothing about a haematocrit-corrected value. By the owner's decision the same windows are applied to the actual and the corrected values, and the app carries no caveat text about it.

## Other statements in the report that bear on the app

- Patients expressing CYP3A5 need about 50 % more dose for the same exposure (p. 265, A I). The model's CYP3A5 factors (CL ×1.30, F ×0.82) imply about +59 %: the same direction and size.
- The AUC0–12h correlates better with the 12 h concentration than with C0; evaluating the AUC/C0 ratio once early and once in the stable period is advised (p. 270). This supports reporting the model-based trough next to the AUC.
- Table 2 (p. 269) lists interacting drugs; it is the natural source for an interaction note (not built).
- Once-daily formulations have their own AUC0–24h ranges (p. 271), which is one more reason the app refuses once-daily intervals.
