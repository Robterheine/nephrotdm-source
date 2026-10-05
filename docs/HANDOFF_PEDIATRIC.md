# Hand-off: adding pediatric mycophenolic acid and pediatric tacrolimus to NephroTDM

Written 5 October 2026, after 1.4.0 was published (report, visual refresh, field-fit fixes, interface feedback all live). **Nothing of the
pediatric models is implemented.** *Update (5 October 2026, later): the owner supplied the NONMEM listing of the actual MPA run, `mmfrun57.lst`; it settles the MPA structure and scaling questions (§1.1, §1.4 S1-S3, D8 closed). Owner decision: **the parameter values to implement are the article's (Table 2 / the ESM stream), not the listing's more precise final estimates; the run-status message of the listing is to be ignored.*** What exists: this plan, the two published NONMEM streams (verbatim, `tools/nonmem_verify/ped/`) and hand-calculated
reference numbers (§4.4). A new session can start at §0 and work through §11 in order. This will be **1.5.0**.

The brief from the owner: add a **pediatric kidney** version of mycophenolic acid (MPA) and of tacrolimus, from the attached papers and NONMEM control
streams. For tacrolimus, as for the adult tacrolimus model, **troughs and AUCs are shown both as actual and haematocrit-corrected (to 0.35), using the
relationship in the control stream.** The plan must cover the interface, validation against NONMEM, and involve a pharmacometrician, a statistician and a UI
designer who keeps the new design in place (§3, §6, §7). Written from those seats, plus the coder's.

---

## 0. Read this first (for the next session)

**Repo rules** (`CLAUDE.md`, `README.md` §2). The ones that bite here:
- Never hand-edit `nephrotdm.html`; `node build.mjs`. `src/version.js` and `package.json` move together (1.4.0 now; this is 1.5.0).
- `npm test` (111 + 60 + 39 + 9 + 15 at hand-off) and `node tools/verify_model.mjs` must pass. **Red-first**: every new assertion is shown to fail on the unfixed code; a sabotage run turns the suite red. Read stdout AND stderr (failures go to stderr).
- **Existing numbers must not move.** Bit-identity records: `tests/mpa_v111_regression.json` (V16), `tests/tac_v121_regression.json` (V16b), `tests/evr_regression.json`. `tests/ui_text_snapshot.json` (MPA and tacrolimus UI strings) is re-recorded only deliberately and the diff is read (done for the 1.4.0 rename: only "MPA TDM" became "Mycophenolic acid").
- The app **never suggests, recommends or optimizes a dose or interval.** Therefore the paper's improved starting-dose table (Heida 2024, Table 3) and any dose recommendation of Heida 2026 are **out of scope**. Time is in hours in the engine; doses are entered in mg and converted once (`doseToEngine`).
- Text: no em-dashes, no filler, no claim stronger than the evidence; research-use disclaimer stays; **no text saying a corrected value or target is "not validated"**; escape all user text; no dependencies; offline single file.
- **Design stays in place** (§6): tokens, IBM Plex fonts, drug cards, tiles with range bars, two-column workspace, 44 px tap targets, the one primary action, **no dark mode**, field-fit rules (`tools/audit_fields.js` must report zero offenders at 320/375/768/1100/1280/1920 px for every drug). `tests/test_refresh.js` guards this and is extended, never loosened.
- Do not push without the owner's go. Staging: edit the OneDrive folder, then rsync to `~/git-publish/nephrotdm-source` (exclude `.git`, `.DS_Store`, `mpa-tdm.html`, `docs/AUTHOR_QUERY*`), copy `nephrotdm.html` to `~/git-publish/nephrotdm/index.html`, commit, push (memory: `nephrotdm-publish-plan.md`).

**Sources** (owner's Desktop folder `Mycophenolic acid and tacrolimus/`; do not copy the PDFs into the repo):

| File | What it is |
|---|---|
| `228_2024_Article_3743.pdf` | **MPA model.** Heida A, Jager NGL, Aarnoutse RE, de Winter BCM, de Jong H, Keizer RJ, Cornelissen EAM, ter Heine R. *Model-informed dose optimization of mycophenolic acid in pediatric kidney transplant patients.* Eur J Clin Pharmacol 2024;80:1761-1771. doi 10.1007/s00228-024-03743-0 |
| `228_2024_3743_MOESM1_ESM.docx` | its NONMEM code (copied to `tools/nonmem_verify/ped/mpa_ped_published.ctl`) |
| `mmfrun57.lst` | **NONMEM 7.5.1 listing of the actual MPA run (run 57, 26 April 2023)**: the real control stream, final estimates, standard errors, shrinkage. **Authoritative for the structure and the scaling; the parameter values used are the article's (owner decision).** Copied to `tools/nonmem_verify/ped/mmfrun57.lst`; its control stream is `mpa_ped_run57.ctl` |
| `228_2024_3743_MOESM2_ESM.docx` | its external-dataset VPC figure (image only) |
| `s40262-026-01708-3.pdf` | **Evaluation paper, both drugs.** Heida A, Cornelissen EAM, Aarnoutse RE, de Winter BCM, Keizer RJ, ter Heine R, Jager NGL. *Structured evaluation of model-informed precision dosing of mycophenolic acid and tacrolimus in pediatric patients with kidney disease.* Clin Pharmacokinet 2026. doi 10.1007/s40262-026-01708-3 (the article's internal title wording differs from the file name; cite from the PDF) |
| `40262_2026_1708_MOESM1_ESM.docx` | its ESM: **tacrolimus control stream (S1)**, assay information (S2), Table S1 parameters with shrinkage, GOF/VPC figures (copied to `tools/nonmem_verify/ped/tac_ped_published.ctl`) |
| `schijvens 467_2018_Article_4117.pdf` | Schijvens AM et al. *The potential impact of hematocrit correction on evaluation of tacrolimus target exposure in pediatric kidney transplant patients.* Pediatr Nephrol 2019;34:507-515. Source of the haematocrit correction (Eqs. 1-2, Bmax 418, Kd 3.8, reference 0.35) and the local target tables |

**Not in the folder, needed:** Schijvens AM, de Wildt SN, Cornelissen EAM, van Hesteren FHS, Schreuder MF, ter Heine R. *Low bioavailability of oral tacrolimus suspension in pediatric kidney transplant recipients.* Clin Pharmacokinet 2020;59:1483-1491 (the tacrolimus model's origin: population, covariate ranges, caveats; the owner is the last author). Also the Brunet 2019 pediatric paragraph (see D7).

**Rob ter Heine, the owner, is the last author of all four model/evaluation papers** and will answer the author queries of §1.3 directly. Same working pattern as everolimus: his answers close a query, and the model is used exactly as coded.

---

## 1. What the sources say

### 1.1 MPA (Heida 2024)
- Data: 30 children, kidney transplant, MMF (CellCept) with tacrolimus (83 %) or everolimus (17 %); **no ciclosporin**. 266 concentrations (20 full curves, 24 limited curves, 25 troughs), 1-6 occasions per patient. Age 4-18 (median 13), weight 12.9-79.9 kg, **albumin 24-42 g/L**, median 9.5 days post-transplant (range 2-3058). Assay: **EMIT** (Cobas, Roche), plasma, mg/L.
- External evaluation: 29 children, Erasmus MC, LC-MS or EMIT, ciclosporin patients excluded; slight under-prediction at population level, adequate individually.
- **Dose is in MMF-equivalent mg, concentrations in MPA mg/L** (stated in the Methods). So CL/F absorbs the MMF-to-MPA factor. **The adult app's MMF→MPA conversion (×0.739 or similar) must NOT be applied to this model.** Highest-risk unit trap of the task; test it.
- Structure (Fig. 2): dose → one transit compartment → central ⇄ peripheral, first-order elimination. Both transfer steps use the same rate KTR, so absorption is two equal first-order stages (an Erlang-2 input: the paper counts "one transition compartment" besides the depot).
- **Parameters = the article's values (Table 2 and the ESM stream; owner decision 5 October):** CL/F θ1 **16.0** L/h × (WT/70)^0.75 × (ALB/**34**)^**−2.49**; Vc/F θ2 **24.9** L × (WT/70); Vp/F θ3 **1590** L × (WT/70); Q/F θ4 **36.2** L/h × (WT/70)^0.75; KTR θ5 **1.48** /h × (WT/70)^−0.25. Albumin is normalised by **34** g/L (the text's 35 and −2.5 in Eq. 1 are wrong, run 57 and Table 2 agree on 34). For information, the listing's final estimates are 16.014, 24.820, 1583.9, 36.226, 1.4778, −2.4828 (differences ≤ 0.4 %, volume 0.3 %, and ≤ 0.9 % in the exponent); they are not used. Standard errors from the listing (3 s.f.): θ1 6.76, θ2 26.1, θ3 1730, θ4 8.28, θ5 0.360, θ6 1.14: the volumes are poorly identified.
- Random effects, **variances** (the article's: ω² CL **0.139**, Vc **2.42**, Q **0.337**, occasion **0.19**, σ² **0.223**; the CVs in Table 2 follow from CV = √(e^ω²−1): 38.6 %, 320 %, 63.6 %, 46.1 %, 47.3 %): IIV on CL, **Vc**, Q; IIV on Vp and KTR fixed to 0; **inter-occasion variability on relative bioavailability F, ω² 0.19, one shared variance for up to 10 occasions**; **proportional residual error σ² = 0.223**. Shrinkage (Table 2): CL 34.6 %, Vc 31.6 %, Q 28.0 %, F 24.5 %, residual 11.7 % (the listing's SD-based values: 35.8, 32.7, 29.3, 25.8, 11.7 %). No ω² convention question here (unlike the adult de Winter model): the stream is unambiguous.
- Estimation FOCE-I with interaction (the paper says NONMEM 7.4.1, the listing 7.5.1); 30 individuals, 266 observations; records with CMT 4 (a dose-time helper) are ignored. Explicitly **not** covered: ciclosporin co-medication (the paper says the model "might not be extrapolated" to it), EC-MPS (no data), enterohepatic recirculation (not modelled; slight over-prediction at 6 h in the VPC), nephrotic syndrome (not in the data; only the 2026 prospective set has 2 such patients).
- Target: AUC0-12 30-60 mg·h/L (kidney transplant, consensus); **>50 for nephrotic syndrome** (2026 Table 2).

### 1.2 Tacrolimus (Schijvens 2020 model, refitted for Heida 2026)
- Heida 2026: "the covariates included in the model were weight, hematocrit, and height. As height data were not consistently available, we refitted the model with only weight and hematocrit as covariates". **The control stream in the ESM is that refitted model**, estimates in Table S1. The app must cite both papers and say which stream it implements.
- Population of the 2026 tacrolimus development data: 38 children, age 8.5 (1-17) y, weight 24.7 (9.1-78) kg, median 11 days post-transplant, dose 0.4 (0.2-0.6) mg/kg/day twice daily, 7 (3-10) samples per patient; 23 full curves. Schijvens 2019 data: haematocrit median 0.29 (0.26-0.31), 92 % below 0.35. Assay: **LC-MS/MS** (bias 0.1 %, imprecision 3.6 %). External evaluation of the original model: 46 children, 722 concentrations, adequate with slight population under-prediction.
- Structure: the **same liver model as everolimus M3**: dose → **three equal first-order stages (Erlang-3, rate KA)** → liver ⇄ central ⇄ peripheral, elimination from the liver (well-stirred: QHP = 90 (1−Ht) (WT/70)^0.75, fu = 1, EH = CLINT/(QHP+CLINT), CLH = EH·QHP, VL = 0.0437 WT^0.9, K20 = CLH/VL, K23 = QHP(1−EH)/VL, K32 = QHP/V3, K34 = Q/V3, K43 = Q/V4). Concentration observed is **whole blood**: Cwb = Cp (1 + Bmax Ht/(Cp + Kd)), **Bmax 418 µg/L, Kd 3.8 µg/L** (the same relation as the adult Størset model, and the same as Schijvens 2019 Eq. 1). Units in the stream: µg, µg/L, L.
- Parameters (Table S1): **KA capsule 2.83 /h, KA suspension 18 /h; CLINT 987 L/h; V3 508 L; V4 487 L; Q 112 L/h; relative F of suspension 0.46** (capsule = 1). Scaling: clearances and Q ×(WT/70)^0.75, volumes ×(WT/70).
- Random effects (variances): IIV KA 0.644, CLINT 0.456, V3 0.692; IIV on F fixed 0; **no inter-occasion variability**; proportional residual σ² 0.0374 (19.3 %). Shrinkage: KA 28.2 %, CLINT 0.1 %, V3 22.7 %, residual 14.2 %.
- **Plasma AUC identity** (exact, an oracle): steady-state AUC0-τ of plasma = F·Dose/CLINT (hepatic flow cancels). Whole-blood AUC is not a closed form (non-linear binding) and is integrated numerically.
- **Corrected exposure** (owner brief): the same plasma curve read through the stream's relation at Ht 0.35, i.e. Cwb(0.35) = Cp (1 + 418·0.35/(Cp + 3.8)); "actual" is the same curve at the patient's Ht. This is what the adult tacrolimus part of the app already does (`toObs`, `HCT_REF` 0.35). Schijvens 2019 instead converted whole-blood to plasma (Eq. 2) and compared with plasma targets derived from adult simulations (power law plasma AUC = 0.0218·WBAUC^1.0772); the app's version is the direct, exact form of the same idea and compares with whole-blood targets at Ht 0.35.

### 1.3 Evaluation paper (Heida 2026): what it means for the app
- A **3-sample schedule (t = 0, 1, 2 h)** estimates the AUC0-12 of the same day accurately: MPA MPE 0.1 % (−0.3 to 0.6), NRMSE 21.0 % (7.1-34.8); tacrolimus MPE 0.2 % (0.03-0.4), NRMSE 7.8 % (3.0-12.6). Trough only: MPA MPE 6.6 %, NRMSE 32.5 %; tacrolimus MPE 3.7 %, NRMSE 22.0 %. (Tables 4 and 5; thresholds 25 %.) These are the app's benchmark (§7, L5).
- **Predicting the AUC at the next occasion (about 3 months later) failed**: MPA MPE 15.4 %, NRMSE 48.6 %; tacrolimus MPE 64.2 %, NRMSE 210 % (Table 7). Between-occasion variability dominates. **Consequence for the app:** the estimate describes the patient on the sampled day; the dose explorer's projection assumes the same state continues. Say so in the About text, the explorer note and the report, and do not describe anything as a forecast of future exposure.
- Targets (Table 2): MPA 30-60 (> 50 nephrotic syndrome) mg·h/L. Tacrolimus AUC0-12 (µg·h/L), local guideline plus Wallemacq 2009: **0-6 weeks 180-270; 6 weeks-6 months 100-250; 6-12 months 100-190; > 12 months 80-150**. Troughs (their background, citing Brunet 2019): children 10-20 µg/L in the first 2 months, 5-10 thereafter. Schijvens 2019 Table 1 has the local-protocol trough tables (two regimens, four periods, Ht 0.35 whole blood).
- The 2026 prospective set used InsightRX; this app is independent of it. Nothing in the 2026 paper is a dose recommendation to copy.

### 1.4 Defect and discrepancy register (found while reading; each needs an owner answer or a decision)

| # | Where | Finding | Proposed handling |
|---|---|---|---|
| S1 | MPA stream | **RESOLVED by `mmfrun57.lst`.** The ESM text was a partial rename of the real run. Real stream: compartments `DOSE(1) CENTRAL(2) PERIPHERAL(3) TRAN(4)`, `K14=KTR`, `K42=KTR`, `K23=Q/V2`, `K32=Q/V3`, `K20=CL/V2`, `S2=V2`: V2 (θ2 = 24.82) is the central and V3 (θ3 = 1583.9) the peripheral volume, which is the reading of Fig. 2 and Table 2. (The ESM text had V4 undefined and used V3/V4 in the K lines.) | Implement the structure of run 57 with the article's values. Verification uses `mpa_ped_run57.ctl` (§8); the ESM text stays as the record of the discrepancy. |
| S2 | MPA | **Resolved:** in run 57 compartment 1 is the default dose compartment, compartment 2 the central (default observation compartment, `S2=V2`), transit is compartment 4. The ESM text had the transit compartment second. | None beyond using run 57. |
| S3 | MPA text vs run | **Resolved:** run 57 uses `(ALB/34)**THETA(6)` with θ6 = −2.4828. The text's 35 and −2.5 (Eq. 1, Methods) are wrong. | Use 34 and −2.49. |
| S4 | MPA | Occasion block declares 10 occasions (`SAME`); the data had at most 6; run 57 sets `IOV` only for `OCC` 1-10 (IOV is 0 otherwise, the NM-TRAN warning). | App caps at the 10 most recent sampled days (same mechanism as tacrolimus). |
| S5 | MPA | IIV on Vc is 320 % (ω² 2.42), 95 % CI of the estimate 15-18 820 %; the paper itself calls it possibly an artefact of variable absorption. | Keep as published. Statistician checks sampler behaviour (the adult V2 had the same issue, §7). AUC does not depend on volumes. |
| S6 | Tac stream | Compartment named `DOSE` and a variable `DOSE` in `$PK` (NMTRAN may object); duplicated names caused error 52 in the everolimus check; `$INPUT`/`$DATA` empty; `MAXEVAL=0` (final estimates frozen). | Verification stream renames and adds CMT/HT/FORM/WT columns (§8). |
| S7 | Tac | The stream is the **refitted** model (Heida 2026), not the 2020 original (height covariate dropped). | Cite both; the About card says "refitted without height, Heida 2026". Ask the owner for the 2020 paper's ranges (§0). |
| S8 | Tac | `AUC=A(7)` is the **whole-blood AUC at the patient's Ht**, accumulated from t = 0 of the record, not an interval AUC. | The app integrates the steady-state interval itself, as it does for the other drugs. |
| S9 | Both | No BLQ handling, no explicit LLOQ in either paper. | The existing rule stands: a BLQ sample is omitted, not entered as 0 or LLOQ. |
| S10 | MPA | Assay was EMIT (overestimates against LC-MS because of the acyl-glucuronide metabolite). The adult MPA card has a general immunoassay note. | Fixed statement on the card: "built on EMIT concentrations; use the same assay". No assay field, no conversion. |
| S11 | Tac vs adult text | Existing MPA Background and About already say "Kidney transplant (adult & pediatric) 30-60" and describe nephrotic syndrome. | The pediatric MPA background is the adult one with the population line changed; no contradictory text. |

---

## 2. Decisions (all closed by the owner on 5 October 2026)

**Owner answers, final. Where a row below still says "Recommendation", the answer in this box wins.**

| # | Answer |
|---|---|
| D1 | **Five flat cards**, order MPA adult, MPA pediatric, tacrolimus adult, tacrolimus pediatric, everolimus. |
| D2 | As proposed: labels "Mycophenolic acid (pediatric kidney)" and "Tacrolimus (pediatric kidney)", ids `mpaped` and `tacped`, spelling "pediatric", background buttons unchanged. |
| D3 | **Typical day, same as the adult drugs.** No new tile; the statistician's L4b result decides later whether a "sampled day" line is worth adding. |
| D4 | **Yes**: occasion layer for pediatric MPA as published. |
| D5 | **Formulation PER DOSE** (not per patient; this differs from the recommendation). A formulation select column in the dose table for pediatric tacrolimus, plus the same choice for the steady-state regimen. Consequences in §4.2, §5.2 (item 8), §5.3, §6 and §10. |
| D6 | **No age field.** |
| D7 | **MPA:** 30-60 only (nephrotic syndrome stays text; no one-sided windows). **Tacrolimus:** the four AUC sets plus both trough sets (10-20 for the first 2 months, 5-10 later), source lines named honestly; no set preselected; no transplant-date field. The Brunet 2019 trough ranges are still to be verified by the owner against the paper (open item, not a blocker for the build). |
| D8 | Closed earlier (run-57 listing; the article's parameter values). |
| D9 | **Hard refusal limits (owner's numbers):** weight **3-200 kg** (MPA and tacrolimus pediatric), albumin **5-50 g/L** (MPA), haematocrit **0.10-0.70 L/L** (pediatric tacrolimus; wider than the adult 0.65, per drug, not changed for the others). Plus a **visible warning, not a refusal,** when a value is outside the range the model was built on: MPA weight 12.9-79.9 kg and albumin 24-42 g/L; tacrolimus weight 9.1-78 kg (haematocrit: the data range from Schijvens 2020, to be added when that paper is at hand). A percentage typed as 38 is still refused with the L/L message. |
| D10 | **No** mg/m² helper. |
| D11 | **Agree**: same A4 builder, per-drug layout, one-line scope statement in the report ("Children with a kidney transplant. Describes the sampled day."). |
| D12 | **Agree**: 1.5.0, `docs/RELEASE_NOTES_V150.md`, push only on the owner's go. |

Original recommendations (kept for the record):

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Drug picker.** (a) Flat list of five cards in the order MPA adult, MPA pediatric, tacrolimus adult, tacrolimus pediatric, everolimus. (b) Three drug cards plus an "Adult / Child" two-segment control that appears for MPA and tacrolimus. | **(a).** The owner has just asked for "(adult kidney)" in the card names, which is this scheme; no extra control or state; the hidden select (`#pt-drug`) simply gets two more options. Cost: five cards at 44 px targets are about 450 px tall on a phone; the UI designer verifies it (§6). |
| D2 | Names and ids. | Labels **"Mycophenolic acid (pediatric kidney)"**, **"Tacrolimus (pediatric kidney)"**; ids `mpaped`, `tacped`; spelling "pediatric" (as in the existing text, the papers and the owner's wording; the app's "haematocrit" stays). The menu buttons stay "Mycophenolic acid background" and "Tacrolimus background"; the dialog says which population. |
| D3 | **Headline endpoint.** The adult tacrolimus model reports the steady-state exposure on a typical day (occasion effects at 0). The 2026 paper validated the AUC of the *sampled day*. | Keep the app's convention: headline = steady-state exposure at the current regimen, typical occasion, same tiles and wording as the other drugs. The statistician measures, in simulation, the difference between "typical day" and "sampled day" AUC (§7 L4b); if material for MPA (IOV 46 %), the pediatric MPA About text and report state the day-to-day spread in numbers, and a "sampled day" line is the owner's call afterwards. No new tile now. |
| D4 | **Occasion layer for pediatric MPA** (IOV on F, ω² 0.19, occasion = calendar day, as in the adult tacrolimus code). | Yes, as published (without it the intervals are too narrow and the 2026 result for current-AUC estimation was obtained with it). Pediatric tacrolimus has none, like everolimus. |
| D5 | **Tacrolimus formulation (capsule / suspension)**: a per-patient choice, or per dose. KA 2.83 vs 18, F 0.46: not a detail. | **Per patient in 1.5.0**, like the MPA formulation rule ("enter only the doses since the switch"; same text). The engine's dose kernel can carry its own KA and F per dose, so a per-dose column is a later, UI-only extension; do it only if the owner sees children switching mid-history often. |
| D6 | **Age field.** Neither model uses age. | No age field. Scope is stated in text and enforced by the checks of D9 on weight, albumin and Ht. |
| D7 | **Window sets to ship.** MPA: "Kidney transplant 30-60" (default) and nephrotic syndrome (> 50). Tacrolimus: AUC sets by time after transplantation (the four rows of Heida 2026 Table 2) and trough sets. The app requires both bounds on an MPA window, so "> 50" cannot be stored one-sided. | MPA: ship 30-60 only as a set; nephrotic syndrome as a sentence in the Background (the existing adult Background already has it) and leave one-sided windows out (the user can type 50 and 100; say so). Tacrolimus: four AUC sets with the source named honestly ("local guideline of the Radboudumc and Wallemacq 2009, as in Heida 2026"); trough sets 10-20 (first 2 months) and 5-10 (later) **after the owner verifies them against Brunet 2019** (the PDF is his; our `SOURCE_ANALYSIS_BRUNET_2019.md` has no pediatric section). Default: none preselected for tacrolimus (time after transplantation is not an input); the "Use" buttons in the Background dialog set one. No new transplant-date field. |
| D8 **(closed, 5 October)** | **Author queries** (§1.4 S1-S3): volumes, observation scaling, albumin normaliser. | Answered by the run-57 listing: central V2, peripheral V3, observation in the central compartment, albumin normaliser 34. Parameter values: the article's (owner, 5 October). |
| D9 | **Input limits.** | Refuse outside the data's range with the reason, warn near it: MPA weight 10-90 kg (data 12.9-79.9), **albumin required, 20-50 g/L** (data 24-42; the exponent −2.49 makes extrapolation steep: warn outside 24-42); tacrolimus weight 8-90 kg (9.1-78), **Ht required per patient and per sample, 0.10-0.65** as for the other tacrolimus models, a percentage typed as 38 refused with the L/L message. Final numbers to the pharmacometrician and the owner. |
| D10 | **mg/m² helper** (children are dosed per body surface area; licensed MMF is 1200 mg/m²/day). | **No.** It needs height, adds a field, and drifts toward dose guidance. The dose is entered in mg. |
| D11 | **Report.** | Same one-page A4 builder; per-drug `spec.report`. Tacrolimus pediatric shows actual and corrected rows exactly like the adult one; MPA pediatric like the adult MPA. Add the one-line scope statement of §10 to the report scope line. |
| D12 | Version and release. | 1.5.0, release notes `docs/RELEASE_NOTES_V150.md`, push only on the owner's go. |

---

## 3. The team, gates and independence

Nobody reviews their own work (`docs/VERIFICATION_TEAM.md` principle). Seats are separate agents or separate sessions that get the artefacts and the questions of their section, not the builder's conclusions.

| Seat | Role | Owns | Gate it signs |
|---|---|---|---|
| **Coder** (builder) | writes engines, specs, texts, tests | §5 | builds G1-G5; signs none |
| **Pharmacometrician** | model fidelity: code = paper = NONMEM | §4, §8 | **G1** structure, **G2** MAP vs NONMEM |
| **Statistician** | inference, calibration, benchmark replication, acceptance numbers | §7 | **G3** calibration, **G4** benchmark |
| **UI designer** | design system stays; five-card picker; fields; phone | §6 | **G5** interface |
| Clinical pharmacologist (as for everolimus) | scope, safety, wording of windows and caveats | §10 | G6 text |
| Owner | decisions §2, author queries, window/trough sources, push | §2 | go / no-go |

Gates are in order; a failing gate returns to the coder with the seat's written findings. The pharmacometrician and the statistician write their findings into `docs/VERIFICATION_PEDIATRIC.md` (a verdict table like `VERIFICATION_TEAM.md`).

---

## 4. Pharmacometrician: the models, exactly

### 4.1 MPA pediatric (`mpaped`)
The model of run 57 (`mmfrun57.lst`) with the article's parameter values, amounts in mg MMF, concentration mg/L MPA, time h:
```
ALLOCL=(WT/70)^0.75   ALLOV=WT/70   ALLOK=(WT/70)^-0.25
CL  = 16.0 ·ALLOCL·(ALB/34)^-2.49·exp(η_CL)        Vc = 24.9 ·ALLOV·exp(η_Vc)
Q   = 36.2 ·ALLOCL·exp(η_Q)                         Vp = 1590 ·ALLOV            (no η)
KTR = 1.48 ·ALLOK                                    (no η)
F1  = exp(η_occ)    (occasion = sampled day; ω²_occ 0.19, one variance, occasions 1-10)
dose → TRAN: KTR ;  TRAN → central: KTR ;  central⇄peripheral: Q/Vc, Q/Vp ;  elimination: CL/Vc
Cp = A_central/Vc ;  Y = Cp·(1+ε), σ² = 0.223
ω²: CL 0.139, Vc 2.42, Q 0.337 (diagonal; Vp and KTR fixed to 0)
NONMEM: ADVAN5, compartments DOSE(1) CENTRAL(2) PERIPHERAL(3) TRAN(4); K14=K42=KTR; K23=Q/V2; K32=Q/V3; K20=CL/V2; S2=V2; F1 on the dose compartment
```
- **No unit conversion of the dose** (MMF mg in). Enter as `mmf` only; EC-MPS refused with the reason.
- Exact identities (oracles): steady-state AUC0-τ = Dose·e^(η_occ)/CL (η_occ = 0 for the typical day); the AUC does not depend on Vc, Vp, Q or KTR. Steady-state trough and Cmax need the matrix exponential.
- Closed form: disposition poles from the quadratic s² + (k10+k12+k21)s + k10·k21 = 0 (real, distinct, negative); the Erlang-2 input convolved with each pole needs the n-stage kernel (§5.2). Cross-check against the matrix exponential (`tools/evr_prototype/` has the oracles to copy; write a 4-state version).
- Occasion mechanics: copy the tacrolimus calendar-day logic (`nOcc`, `occDays`, `MAX_OCC` 10 here, η names `KF0..`), but only one η per occasion (on F), the same ω².

### 4.2 Tacrolimus pediatric (`tacped`)
As §1.2. It is the everolimus liver engine with: n = **3** stages (not 5), `QHP = 90 (1−Ht)(WT/70)^0.75`, `CLINT` scaled by `(WT/70)^0.75`, `VL = 0.0437 WT^0.9`, `FU = 1`, volumes ×WT/70, `Bmax 418, Kd 3.8, Kns 0`, KA and relative F by formulation, **residual proportional (not log-scale)**, 3 etas (KA, CLINT, V3), **no weight-free constants** (everolimus M3 is not weight-scaled; this one is). Corrected = Eq. at Ht 0.35, `HCT_REF` 0.35 (the same constant as adult tacrolimus).
- The haematocrit enters the PK through QHP. Same approximation as everolimus, already accepted by the owner (D3 there): one Ht for the PK path (the latest sample's), each sample's own Ht for the blood transform. The NONMEM check measures the cost (§8); expect the same order (mean about 1 %, max about 6 % in earlier-sample predictions).
- Identity (oracle): plasma AUC0-τ at steady state = F·Dose/CLINT_i. Whole-blood AUC and trough: numeric (grid 0.25 h trapezoid as in `everolimus.js`).
- Pole-near-degeneracy: capsule KA 2.83 is below the liver pole, suspension 18 /h is near it for small children. The everolimus code already uses a tail-series form of the Erlang kernel for exactly this case (`hconv`); generalise it to n stages and test KA within 1e-6 relative of a pole.
- IIV on KA applies to both formulations (`exp(η_KA)`).
- **Per-dose formulation (D5):** the linear superposition lets every dose carry its own absorption rate and relative F: dose j contributes `F_j·amt_j · Σ_q r_q·h_n(λ_q, KA_j·exp(η_KA), t − t_j)`. The pole and residue computation does not depend on the formulation (QHP, CLINT, VL, V3, V4, Q only), so one `poles()` per individual still serves all doses. Steady state: the repeating regimen carries one formulation (the geometric series needs one kernel); a history with a switch uses the explicit doses. `exp(η_KA)` multiplies both KA values (as in NONMEM).

### 4.3 What the intervals contain
Parameter uncertainty of the patient's individual estimate given the samples, plus the residual error. **They do not contain day-to-day variability for tacrolimus (the model has none) and contain it for MPA only through the occasion η of sampled days.** The 2026 paper shows large between-occasion variability in practice (§1.3). State it (§10).

### 4.4 Reference numbers (hand calculation, numpy matrix exponential; the coder re-derives them with the repo's oracle before trusting them)
MPA, steady state, 12-hourly, typical, η = 0 (the article's values):

| WT (kg) | ALB (g/L) | dose (mg MMF q12h) | CL (L/h) | AUC0-12 (mg·h/L) = dose/CL | trough | Cmax (tmax h) |
|---|---|---|---|---|---|---|
| 38.5 | 34 | 600 | 10.22 | 58.72 | 3.28 | 12.59 (1.05) |
| 38.5 | 34 | 750 | 10.22 | 73.40 | 4.11 | 15.74 (1.05) |
| 20 | 34 | 250 | 6.25 | 39.98 | 2.22 | 9.68 (0.89) |
| 70 | 34 | 1000 | 16.00 | 62.50 | 3.52 | 12.04 (1.21) |
| 38.5 | 28 | 600 | 16.57 | 36.21 | 1.68 | 9.83 (0.99) |

(The fourth row at WT 70, ALB 34 gives CL = θ1 = 16.0 L/h. The 600 mg row sits inside 30-60, the 750 mg row above it, as the paper says of the licensed dose.)

Tacrolimus, steady state, 12-hourly, typical, η = 0 (µg, µg/L; "act" = at the patient's Ht, "corr" = at Ht 0.35):

| WT | Ht | formulation | dose (µg q12h) | plasma AUC (= F·dose/CLINT) | whole-blood AUC act / corr (µg·h/L) | whole-blood trough act / corr (µg/L) |
|---|---|---|---|---|---|---|
| 25 | 0.30 | capsule | 3000 | 6.579 | 194.1 / 225.4 | 10.37 / 12.04 |
| 25 | 0.30 | suspension | 3000 | 3.026 | 95.8 / 111.3 | 4.69 / 5.45 |
| 25 | 0.40 | capsule | 3000 | 6.579 | 257.3 / 226.0 | 14.60 / 12.82 |
| 60 | 0.35 | capsule | 6000 | 6.824 | 233.6 / 233.6 | 13.73 / 13.73 |

Reading: at Ht equal to 0.35 actual = corrected (row 4, a test); the **corrected AUC is almost independent of the patient's Ht** (225.4 vs 226.0 for Ht 0.30 vs 0.40) while the actual AUC differs by a third (194 vs 257): this is the clinical point of the correction and a good UI example. A low-haematocrit child at 194 is in a different place relative to 180-270 than the corrected 225 says.

---

## 5. Coder: how to build it

### 5.1 Shape of the change
Two new spec files, `src/mpaped.js` and `src/tacped.js`, registered like `everolimus.js` (`spec.custom` hooks: `normExtra`, `etaNames`, `omega`, `indivParams`, `simulate`, `prepare`, `exposure`, `toObs`, `fromModel*`, plus `spec.ui`, `spec.report`, `spec.card`, window sets, texts registry `ECU.drugTexts[id]`). Text files `src/texts_mpaped.js`, `src/texts_tacped.js`. `build.mjs` FILES and `src/parallel.js` SOURCES gain the new files. `index.html`: two more `<option>` in `#pt-drug` and nothing else structural (cards are generated from the specs). Read `src/everolimus.js` first; it is the template for both.

### 5.2 Generalisations that are required (found by reading the code)
1. `hconv` in `everolimus.js` is hard-wired to 5 stages (`Math.pow(k/d, 5)`, `x^5`, factorials 120). Both new models need an n-stage kernel (n = 2 and 3). **Choice, to be made with the pharmacometrician:** (a) extract `hconv(n, lam, k, t)` and the pole code into one shared file used by everolimus, tacped and mpaped, with `tests/evr_regression.json` bit-identical as the gate; or (b) copy with parameters into each new file and leave `everolimus.js` untouched. Recommendation: **(b) for 1.5.0** (zero regression risk to a published model; duplication is about 30 lines), revisit after.
2. MPA pediatric has **two** poles (central/peripheral) and **two** stages: its own `poles()` (quadratic) and `simulate`. Tacrolimus pediatric reuses the liver cubic as in everolimus.
3. **Residual model.** Everolimus is log-scale; MPA adult is log-scale; Størset tacrolimus is proportional. Both pediatric models are **proportional on the observation** (Y = IPRED(1+ε)). Find how `bayes.js` selects the residual for tacrolimus (`SIGMA`, the log-variance form) and reuse that path; do not add a third. The pharmacometrician decides whether the proportional form is implemented as the Gaussian proportional likelihood (NONMEM FOCE-I with interaction) or as the log approximation Størset used, and the NONMEM POSTHOC check (§8) arbitrates.
4. `ui.js` has drug-specific switches written for three drugs (`isCustom()`, `isTac()`, texts registry, `usesWeight()`, `HELP_TAC` lookup, `card` rows). Add the two ids through the same hooks (`spec.ui.noun`, `spec.ui.weight`, `shrinkEta`, `occasions`, `badge`, `modelLine`). Prove the three existing drugs unchanged by `tests/ui_text_snapshot.json` (byte-identical) and the three regression records.
5. Covariate form fields come from `covariateFields`: MPA pediatric needs `weight` (kg), `albumin` (g/L) and a fixed formulation line; tacrolimus pediatric needs `weight`, `hct` (L/L, per sample as everolimus), a **formulation select per dose row** (capsule, suspension; labels ≤ 28 characters; owner decision D5, see item 8). Number fields use `sf-num` and `inputmode="decimal"`.
6. The explorer, window sets, report, session export/import (`sessionObj`/`applySession`: add the new ids and fields, old sessions must still load) and the autosave follow the existing hooks.
7. Dose conversion: `doseToEngine` mg → µg for tacrolimus; **MMF mg stays mg for MPA pediatric** (the adult MPA's formulation factor lives in its own spec and is not touched).
8. **Per-dose formulation (D5).** The dose table needs a per-row select (capsule / suspension; labels ≤ 28 characters, `sf-wide`, one column; check the table fits 320 px with `audit_fields.js`), default = the previous row's value, mandatory on every row. `prepare()` passes `form` per dose; `simulate()` takes `KA` and `F` from the dose; session export/import carries the column (old sessions have none: tacrolimus pediatric is new, so no migration). The steady-state regimen row has its own select. Tests: a two-dose history with a switch matches NONMEM (G1 data set includes switches); a row without a formulation is refused with a message naming the row.

### 5.3 Tests to write (red-first), `tests/test_pediatric.js`, added to `package.json`'s `test`
1. **Oracle:** the two engines against a matrix exponential and an RK4 integration (typical and η ±1.5 SD, several weights, doses over a history and at steady state) to ≤ 1e-9 relative.
2. Identities: MPA AUC = dose·e^η_occ/CL (and independent of Vc, Vp, Q, KTR); tacrolimus plasma AUC = F·dose/CLINT; corrected = actual when Ht = 0.35; corrected ≈ independent of Ht (table of §4.4).
3. Reference numbers of §4.4 reproduced.
4. **Unit trap:** an MMF dose of 600 mg gives AUC 58.7 at 38.5 kg/ALB 34, not 43.4 (the 0.739 factor).
5. Scope refusals and warnings (D9), percentage-typed Ht refused, EC-MPS refused, empty albumin refused with a message that names the field.
6. Occasion mechanics (MPA): days become occasions, cap 10, η count follows, samples on one day share one η.
7. `verify_model` blocks for both specs (spec complete: windows, report, card, texts).
8. Guard text tests: no em-dashes, no "not validated", scope sentences present (§10), no dose-recommendation wording, `Table 3`-style dose scheme absent.
9. Regression records for the new models after the numbers are final (`tests/mpaped_regression.json`, `tests/tacped_regression.json`); V16, V16b and `evr_regression.json` untouched.
10. UI structural tests in `tests/test_refresh.js`-style (§6).

Sabotage each: break the Erlang exponent, drop the albumin factor, apply the 0.739 factor, skip the Ht in QHP, use Ht 0.38 as reference, forget the formulation F; confirm each turns a named test red; restore.

### 5.4 Performance
Budget as everolimus: a fit in a worker well under the current time; the cubic and quadratic closed forms cost microseconds. Measure with the pane visible (hidden panes run several times slower). Page size grows by roughly 25-30 KB (two engines, two text files); accepted.

---

## 6. UI designer: the new design stays

**Principle:** nothing already shipped looks or behaves differently except that the picker has five cards. Everything new reuses existing components and tokens; nothing new is invented.

1. **Drug cards (D1a).** Five cards from the same `drugCardsHtml`: name line "Mycophenolic acid (pediatric kidney)", sub line "AUC₀–₁₂ₕ · Heida 2024" for MPA, "AUC and trough · Schijvens 2020, refit 2026" for tacrolimus (sub lines ≤ one line at 320 px; the designer shortens if not). Order as in D1. Same card style, no extra icons or badges. The selected card keeps the accent border. On wide screens the list stays in the left column; if five cards push the first input below the fold at 1280×800, the designer may use a two-column card grid **only** below 1100 px or above, never a new component; decision recorded with screenshots before and after.
2. **Fields.** All fields from existing field classes; labels sentence case, units in the label ("Weight (kg)", "Albumin (g/L)", "Haematocrit (L/L)"). Required fields stay required with the existing inline message. The dose-table formulation select (pediatric tacrolimus, one per dose row and one for the steady-state regimen) uses labels ≤ 28 characters and must fit the table at 320 px (the audit rule). No new field types, no age field (D6).
3. **Results.** The same tiles: pediatric tacrolimus gets the actual and corrected rows through the existing `exposureRows` path (as adult tacrolimus), pediatric MPA the single-AUC tile (as adult MPA). Range bars, plain-probability sentence (`probLine`), "In the window" chips unchanged. A scope line under the tile title for the pediatric drugs ("For children with a kidney transplant. Describes the sampled day.") in the existing muted style.
4. **Report** (A4 one page): per-drug `spec.report` (`lead`, `scope`, `windowSource`, `modelCite`, `reading`); citations short as for evr/tac (first three authors + et al. in the header); the one-page measurement (≤ 1103 px of 1123) re-run for both new drugs in both modes (steady state and history), with and without a window, with and without samples.
5. **Texts.** Plain, short, no jargon; the "Background" dialog uses the existing sections (reference values, sampling, assay, why model-based). Wording in §10.
6. **Phone.** 320, 375, 768 px: sticky Run bar, decimal keypad, no horizontal scroll. Run `tools/audit_fields.js` for **all five drugs** at **all six widths**, steady-state and history modes, and in the report dialog. Zero offenders is the gate.
7. **Guards (extend `tests/test_refresh.js`, never loosen):** five options in the hidden select and five cards in the same order; card names ≤ one line at 320 px (measured in the browser); hidden-select `!important` rule intact; one primary action; tap size and type tests unchanged; no dark-mode media query; fonts embedded; the select-label ≤ 28 rule covers the new specs; the first-visit banner stays removed (owner decision, 5 October).
8. **Process.** Before/after screenshots at 1280 and 375 for every drug (card list, input column, results), reviewed by the designer against the 1.4.0 screenshots; any difference in an existing drug is a defect.

---

## 7. Statistician: validation plan and acceptance numbers

All acceptance numbers are fixed here, before any result is seen.

**L1 Structure vs NONMEM (§8).** Max relative difference app vs NONMEM predictions ≤ 1e-6 (everolimus achieved 5e-9, Størset 5e-9).
**L2 MAP vs NONMEM POSTHOC.** The app's MAP η equal NONMEM's empirical Bayes estimates: median max|Δη| ≤ 1e-3 (the adult MPA achieved 1e-7 at optimiser tolerance), and the reported AUC from MAP within 0.5 %. If not, the likelihood form differs (proportional implementation, S3 of §5.2), and that is a finding, not a tolerance.
**L3 Posterior vs NONMEM Bayes/IMP.** For MPA pediatric (the model with IOV and the very wide Vc prior): app posterior median AUC and trough vs NONMEM IMP/BAYES on the same simulated patients, templates `bayes_mmf.mod`, `imp_ecmps_fixedm.mod.tmpl`; agreement of medians within 5 % for ≥ 95 % of patients (the adult criterion, `docs/NONMEM_CROSSCHECK.md`). Tacrolimus pediatric likewise on a smaller set.
**L4 Calibration by simulation-recovery** (template `tools/calibrate_storset.mjs`; one cell = 100 simulated patients, SE of coverage about 3 %): coverage of the *true* steady-state AUC and trough by the 5-95 % interval (actual and corrected for tacrolimus) in **85-95 %**, convergence ≥ 98 %, no cell where the median is biased by more than 5 %.
- MPA pediatric cells: trough only; 0/1/2 h (the 2026 schedule); 0/0.5/2 h (the development limited curve); rich (8 samples); with and without a second occasion; weight low (13), median (38), high (75) kg; albumin 25, 34, 41 g/L. Simulate with the **proportional** residual and the occasion η.
- Tacrolimus pediatric cells: trough only; 0/1/2 h; 0/1/2/4 h; Ht 0.22, 0.30, 0.45; capsule, suspension, and a history with a switch between them; weight 12, 25, 60 kg.
- **L4b typical day vs sampled day:** in the simulation also record the true AUC of the sampled day (occasion η included) and report the coverage of that quantity and the width of the typical-day interval relative to it. Decides D3.
- Sampler behaviour: R-hat, effective sample size, the 8-chain pooled default, tail behaviour of Vc (ω² 2.42) and of V3 (0.692); the AUC chain must converge even when the volume chains are slow (document the V2 precedent in `docs/METHODS_AUDIT_V101.md`).
**L5 Benchmark replication of the 2026 paper** (plausibility, not equivalence: simulated patients are model-consistent, real ones are not). Simulate the paper's 20 MPA and 23 tacrolimus full profiles (weights and Ht from Tables 1 and 6), sample at the eight schedules of Tables 4-5, estimate with the app, compute MPE, NRMSE, P10/P20/P30 against the true same-day AUC. Expectation: bias near 0 and NRMSE **not worse** than the published values (MPA 3-point 21.0 %, tacrolimus 3-point 7.8 %); the order of schedules by NRMSE matches the paper. A result clearly worse than the paper's is a defect in the app (or in the reading of the model) to chase.
**L6 Regression records** after the numbers are final.

Honest-reading items for the report to the owner: the intervals do not contain day-to-day variability for tacrolimus; real-world prediction error 3 months ahead was 64 % MPE (tacrolimus) and 15 % (MPA) in the paper; the statistician states these next to the calibration table so coverage is not read as a forecasting guarantee.

---

## 8. NONMEM verification (procedure)

NONMEM 7.6 is at `~/nm76/run/nmfe76`; runs take seconds. Templates: `tools/nonmem_verify/evr/` (liver model; the closest), `tools/nonmem_verify/tac/` (Størset), the MPA scripts at the top of `tools/nonmem_verify/`. Create `tools/nonmem_verify/ped/` with, per drug, `struct_*.mod`, `make_*.mjs` (data + app predictions), `compare_*.mjs`, `run_*.sh`, and POSTHOC counterparts.

1. **Corrected streams.** Keep `*_published.ctl` verbatim. Write the verification streams from them:
   - MPA: use `mpa_ped_run57.ctl` (the control stream of the listing; its `$THETA/$OMEGA/$SIGMA` are replaced by the article's values 16.0, 24.9, 1590, 36.2, 1.48, −2.49; ω² 0.139, 2.42, 0, 0.337, 0, 0.19 (10 occasions, SAME); σ² 0.223, frozen with `MAXEVAL=0` and `POSTHOC` for the evaluation runs); data columns as in the listing (`ID TIME AMT EVID CMT MDV DV II SS OCC WT ALB`), CMT 1 for doses and 2 for observations; η supplied as data for the structural check (as for everolimus), IOV η by occasion.
   - Tacrolimus: rename compartments (`DOSE`→`DEPOT`; no duplicates), `$INPUT ID TIME AMT DV CMT EVID WT HT FORM OCC` (the stream itself has no OCC), drop the AUC compartment (the app integrates), etas as data.
   - Lessons carried over from everolimus/tacrolimus: records in time order; a pre-dose observation goes before a same-time dose; `PRED` is a reserved name; covariates on every record; consistent units (µg and µg/L; mg and mg/L).
2. **Structural check (G1).** About 40 simulated subjects per drug: constant and time-varying Ht (tacrolimus), weights 9-80 kg, albumin 24-42 (MPA), both formulations and switches between them within a history, steady state (`SS=1, II=12`) and 7-day histories with a dose change, etas 0 and ±1.5 SD, occasions 1-3 (MPA). Compare plasma and whole-blood predictions. Pass: § L1. Also report the time-varying-Ht approximation cost (tacrolimus).
3. **POSTHOC check (G2).** On simulated patients with proportional noise, NONMEM `POSTHOC` EBEs vs the app's MAP (templates `make_posthoc*.mjs`, `compare_posthoc*.mjs`). Pass: L2.
4. **Bayes/IMP check** (L3), MPA first.
5. Golden fixtures to `tests/nonmem_ped_*.csv/.tab` for in-repo tests, as for everolimus.
6. Record all results in `docs/NONMEM_CROSSCHECK_PEDIATRIC.md` and `docs/CALIBRATION_RESULTS_PEDIATRIC.md`.

---

## 9. Window sets to ship (see D7; the owner closes the sources)

| Drug | Set id | Content | Source line shown |
|---|---|---|---|
| MPA ped | `kidney-ped` | AUC 30-60 mg·h/L (default, as adult) | IATDMCT consensus, Bergan 2021 (grade B, II) |
| Tac ped | `ped-0-6w` | AUC 180-270 µg·h/L (whole blood, Ht 0.35) | local guideline and Wallemacq 2009, as in Heida 2026 Table 2 |
| Tac ped | `ped-6w-6m` | AUC 100-250 | same |
| Tac ped | `ped-6-12m` | AUC 100-190 | same |
| Tac ped | `ped-12m+` | AUC 80-150 | same |
| Tac ped | `ped-trough-early` | trough 10-20 µg/L (first 2 months) | Brunet 2019 as cited by Heida 2026 (**owner verifies**) |
| Tac ped | `ped-trough-late` | trough 5-10 µg/L | same |

The tacrolimus windows apply to **corrected (Ht 0.35) values**; say so in the dialog and on the tile (the targets are defined at Ht 0.35, Schijvens 2019). The actual value is shown beside it, not judged against the window. (If the owner wants the window judged on the actual value, it is a one-line spec switch, but the sources define the targets at Ht 0.35.) Nephrotic syndrome (> 50 mg·h/L) is text only (D7). `windowDefaultLo/Hi` null for tacrolimus (no preselected set, as adult tacrolimus).

---

## 10. Texts (clinical pharmacologist and owner review)

Required statements, in the owner's plain style (the text goes through the humanizer skill):
- **Scope, MPA:** "Children with a kidney transplant on mycophenolate mofetil (CellCept) together with tacrolimus or everolimus. Not for ciclosporin co-medication, for EC-MPS or for other indications. Built on weight 13-80 kg and albumin 24-42 g/L. Enter the MMF dose as mg of MMF."
- **Scope, tacrolimus:** "Children with a kidney transplant on twice-daily tacrolimus as capsule or suspension. Built on weight 9-78 kg; LC-MS/MS whole-blood concentrations only; haematocrit needed."
- **What the estimate is:** "The estimate describes this patient on the day of the samples. Exposure changes from day to day and over months; in a prospective evaluation, predicting the AUC about three months later was not accurate. Repeat measurements." (also in the explorer note and the report).
- **Sampling:** "Samples at 0, 1 and 2 hours after the dose estimated the AUC accurately in the model's authors' evaluation." Numbers of §1.3 in About with the source.
- **Assay:** MPA "built on EMIT concentrations, use the same assay"; tacrolimus "LC-MS/MS only".
- **Corrected value (tacrolimus):** "Corrected to haematocrit 0.35: the whole-blood concentration this patient would show with the same plasma concentration at a haematocrit of 0.35, computed with the relationship in the model." (same sentence as adult). No "not validated" wording.
- **The 0.46 and the two absorption rates** in the model table; the formulation is chosen per dose (a switch between suspension and capsule is entered on the dose row).
- Model card: both papers cited, "refitted without height" (S7), stream units, estimation method FOCE-I, the exclusions of §1.1, the unaddressed items (enterohepatic recirculation; ciclosporin).
- No starting-dose scheme, no mg/m² guidance, no sentence that could be read as dose advice.

---

## 11. Implementation sequence (each step ends with `npm test`, `node tools/verify_model.mjs` and the three regression records green)

1. **Owner decisions: done (§2, 5 October).** Still to come from the owner: the Brunet 2019 check of the trough ranges and the Schijvens 2020 paper (neither blocks steps 2-4). *(Gate 0)*
2. Pharmacometrician writes the corrected NONMEM streams and runs the **structural** check against hand-written reference predictions (§4.4 numbers first). Coder writes the oracle tests (red). *(G1 prerequisites)*
3. Coder: `tacped` engine (liver, n = 3) from `everolimus.js`; tests 1-4 of §5.3 green; spec, texts; **G1 for tacrolimus**.
4. Coder: `mpaped` engine (2 poles, n = 2, occasion η); tests green; **G1 for MPA**.
5. `ui.js` hooks for the two ids; snapshot and regression gates; drug picker with five cards; fields; windows; report; session import/export. **G5 pass 1** (designer, with screenshots and `audit_fields.js`).
6. POSTHOC check (G2); Bayes/IMP (L3).
7. Calibration L4/L4b and benchmark L5 in the background (about half an hour per drug); statistician signs **G3, G4**; update iteration budgets if needed.
8. Texts review (G6), regression records, docs: `RELEASE_NOTES_V150.md`, `NONMEM_CROSSCHECK_PEDIATRIC.md`, `CALIBRATION_RESULTS_PEDIATRIC.md`, `VERIFICATION_PEDIATRIC.md`, README (test counts, file lists, open items), `SOURCE_ANALYSIS_PEDIATRIC.md`, `VERIFICATION_TEAM.md` addendum, memory notes; version 1.5.0 in both places; rebuild.
9. **Final browser pass** in the visible pane (all five drugs: steady state, history, windows, explorer, report print preview, export/import, drug switch, cancel, 320/375/768/1280, narrow pane) and a **real print/PDF check** of the A4 report with the owner (still open from 1.4.0). Summary to the owner; **do not publish** without the go.

---

## 12. Risks and open questions

- **MPA stream (S1-S3): resolved** by the run-57 listing; parameter values are the article's by owner decision.
- **Proportional residual form** vs the log approximation: affects the posterior for low concentrations (the proportional σ 47 % in MPA is large). L2 decides.
- **Vc IIV 320 %** and its 15-18 820 % CI: slow chains, wide volume posteriors; AUC robust, concentration predictions at early times not. Texts must not suggest otherwise.
- **Between-occasion variability** is the dominant real-world error (2026); the intervals understate it for tacrolimus by construction. Wording, not code.
- **Time after transplantation** drives the tacrolimus windows but is not an input (D7); a wrong set picked by the user is the user's choice and the set name is shown on the tile and the report.
- **Time-varying Ht** in the tacrolimus PK path: the one-Ht approximation, measured in G1.
- **Dose-table width with a formulation column (D5):** verify at 320 px early; if it does not fit, the select moves under the date and dose fields on narrow screens (row becomes two lines), not a new component.
- **Five cards on a phone** (D1): verify early (step 5), switch to D1b only if the designer shows the first input is pushed too far down.
- **Two models from one first author and one last author** (the owner): independence of the review rests on the seats of §3, not on authorship; say so in the verification note.
- The human review of the whole app (`VERIFICATION_TEAM.md`) and the print check of the report remain open from 1.4.0.

---

## 13. Appendix: files created for this hand-off

- `docs/HANDOFF_PEDIATRIC.md` (this file)
- `tools/nonmem_verify/ped/mpa_ped_published.ctl`: Heida 2024 ESM 1, verbatim, with a header listing its defects (superseded by run 57)
- `tools/nonmem_verify/ped/mmfrun57.lst` and `mpa_ped_run57.ctl`: the actual MPA run, listing verbatim and its control stream (structure authoritative; parameter values are the article's)
- `tools/nonmem_verify/ped/tac_ped_published.ctl`: Heida 2026 ESM S1, verbatim, with a header naming its origin

Nothing else in the repo was changed for this hand-off; `nephrotdm.html` and the live page are the 1.4.0 build.


---

## Corrections after the review round (5 October 2026)

Found by the pharmacometrician and the clinical pharmacologist; the text above is left as written.
- Section 1.1 and S5: the 95 % interval of the estimate of the Vc variance in Table 2 is **109.65-18 819.64 %**, not "15-18 820 %". The CVs of Table 2 for Q (63.6 %), the occasion effect (46.1 %) and the residual (47.3 %)
  follow from the listing's variances (0.339, 0.193, 0.224), not from the ESM values used (0.337, 0.19, 0.223: 63.3, 45.7, 47.2 %). Heida 2026 gives n = 29 against 30 in the 2024 paper.
- Sections 1.2, 2 (D7), 9 and 10: "the tacrolimus windows are defined for whole blood at haematocrit 0.35" is **not supported by the sources**. Heida 2026 normalised AUCs to 0.35 before comparing, following Schijvens
  2019, which assumes literature targets refer to 0.35. The app now says the targets are taken to refer to 0.35 and still judges the corrected value (decision unchanged).
- Section 2 (D9): the haematocrit warning was left open for the range; the owner set it: outside 0.15-0.60 (refusal limits stay 0.10-0.70).
- Section 9: "local guideline of the Radboudumc" is not in Heida 2026 (it says "local guidelines"); the institution name was removed.
- Section 12: "the set name is shown on the tile and the report" was not implemented in the first build; it is now (typed bounds read "your own bounds").
- Section 4.4: Cmax and tmax of the MPA table are rounded from a coarse grid (see `NONMEM_CROSSCHECK_PEDIATRIC.md`).
