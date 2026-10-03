# Source analysis: everolimus consensus (Masuda 2025) and the model paper (Zwart 2021), what the app takes from them

Masuda S, Lemaitre F, Barten MJ, et al. Everolimus personalized therapy: second consensus report by IATDMCT. Ther Drug Monit 2025;47(1):4–31.
Zwart TC, Moes DJAR, van der Boog PJM, van Erp NP, de Fijter JW, Guchelaar HJ, Keizer RJ, ter Heine R. Model-informed precision dosing of everolimus:
external validation in adult renal transplant recipients. Clin Pharmacokinet 2021;60:191–203. doi 10.1007/s40262-020-00925-8.
Both read on 3 October 2026 from the PDFs supplied by the owner (text extracted with `pdftotext`; the numbers below were checked against the extracts).
Paraphrased, not quoted. Only the adult kidney parts were used.

## What the consensus says (adult kidney, twice-daily everolimus)

| Statement | Where | Used for |
|---|---|---|
| Trough target 3–8 ng/mL when everolimus is combined with a reduced-exposure calcineurin inhibitor | Table 1 (p. 10); kidney recommendations (p. 16) | window set `evr-cni`, the default |
| Trough target 6–10 ng/mL without a calcineurin inhibitor | Table 1 (p. 10) | window set `evr-nocni` |
| The pharmacokinetics are linear and the trough relates well to the AUC; metabolites need no monitoring | p. 9 | why the trough is the target metric; the AUC is shown without a window |
| Terminal half-life about 28 h; AUC24 40–120 µg·h/L (dose-normalised, descriptive) | Table 1 | **not** used as a target: no AUC window is shipped |
| Ciclosporin lowers everolimus metabolism by about half; CYP3A and P-glycoprotein inhibitors and inducers matter; tacrolimus concentration does not change everolimus exposure | p. 9 | About text (what the model leaves out); no interaction field (owner decision) |
| Whole blood is the specimen; LC-MS/MS preferred; LC-MS/MS, QMS, ECLIA and ACMIA results are not interchangeable and no conversion exists; quantification limit close to 1 ng/mL | pp. 13–14 | LC-MS/MS only, one fixed line in the card, no assay field |
| Cancer indications have a higher trough range (12–20 ng/mL) | Table 1 | stated as not covered |

ng/mL equals µg/L and ng·h/mL equals µg·h/L, so the numbers enter the app unchanged. The consensus prints these units as mg/L in Table 1; its text says ng/mL.

## What the model paper says (Model 3, external validation in 173 adult kidney recipients, 4123 concentrations)

| Statement | Table / page | Used for |
|---|---|---|
| Model 3 = Model 2 without the occasion effect on absorption time; no body-size covariate | Methods | the structure of `src/everolimus.js` |
| About 75 % of everolimus in blood sits in red cells at therapeutic concentrations; saturable binding; Eqs. 1–3; reference haematocrit 0.38 for the normalised value | Methods, p. 193–194 | the blood transform and the corrected value (owner decisions D1, D2) |
| Future trough from a previous sample, Model 3: bias +13.5 % and imprecision (MAPE) 30.1 % within 6 months, +6.3 % and 26.2 % later; 65.4 % and 68.5 % of predictions within ±30 % | Table 2 | About text ("about two thirds within ±30 %") |
| Future AUC0–12, Model 3: bias −6.75 % and MAPE 11.1 % within 6 months, +0.08 % and 12.3 % later; 93.8 % and 95.8 % within ±30 % | Table 2 | About text |
| Without any sample (initial): trough bias +5.4 %, MAPE 32.3 %; AUC0–12 bias +42.7 %, MAPE 52.7 % (n = 45) | Table 2 | About text; the reason a run without a sample is labelled a population forecast |
| Haematocrit normalisation: mean change of the trough +4.0 %, of the AUC +2.9 %; at the 5th percentile of haematocrit (0.28) +31 %, at the 95th (0.47) −21 %; more than 20 % in 13.6 % (trough) and 14.3 % (AUC) of occasions | Results | background text ("about one occasion in seven") |

The handoff note said "about 70 % of troughs within ±30 %". Table 2 gives 65–69 % for Model 3, so the texts say "about two thirds".

## Decisions that are the owner's, not the sources'

- No AUC window is shipped (the consensus gives none); the field stays empty with a hint. A user may add one.
- The prednisolone effect (clearance ×1.44 at 20 mg/day or more, none below) is entered as a two-way choice with no default (owner decision D6).
- One haematocrit for the pharmacokinetic path (the latest sample's), each sample's own for the blood reading (D3). Measured cost: mean 1.0 %, largest 6.2 % in the predicted earlier samples (`HANDOFF_EVEROLIMUS_M3.md` §9).
- Intervals contain parameter uncertainty only; a future single measurement scatters more (the model has no occasion layer; the residual error carries it, D10).
