# Source analysis: pediatric MPA and pediatric tacrolimus

The full reading of the four papers, the numbers taken from them and the discrepancy register (S1-S11) are in `docs/HANDOFF_PEDIATRIC.md`, section 1; this page only states what became of
each item and where the evidence is.

| Source | Used for | Notes |
|---|---|---|
| Heida A, et al. Eur J Clin Pharmacol 2024;80:1761-1771 (+ ESM 1) | the MPA model (Table 2 values) | 30 children, EMIT assay, MMF mg and MPA mg/L; the ESM stream text is a partial rename of the real run |
| `mmfrun57.lst` (owner) | structure and scaling of the MPA model | authoritative for compartments (V2 central, V3 peripheral, observation in the central compartment) and the albumin normaliser 34; the **values** shipped are the article's (owner decision) |
| Heida A, et al. Clin Pharmacokinet 2026 (+ ESM S1) | the refitted tacrolimus model, the targets, the sampling and accuracy figures | stream = refit without height; 3-sample schedule and next-occasion results quoted in About |
| Schijvens AM, et al. Pediatr Nephrol 2019;34:507-515 | the haematocrit relation (Bmax 418, Kd 3.8, reference 0.35) and the local target context | the app reads the corrected value directly from the model's own relation |
| Schijvens AM, et al. Clin Pharmacokinet 2020;59:1483-1491 | origin of the tacrolimus model (cited) | **not in the source folder**: its data ranges (haematocrit) are not shown; to be added when the paper is at hand |
| Brunet M, et al. Ther Drug Monit 2019 (as cited in Heida 2026) | the two pediatric trough sets (10-20 and 5-10 µg/L) | **owner has still to verify the ranges against the paper** |

Fate of the register: S1-S3 resolved by run 57 (structure, observation compartment, albumin normaliser); S4 handled by the 10-occasion cap; S5 kept as published (Vc variance 2.42; AUC does not depend on it;
sampler behaviour checked, `CALIBRATION_RESULTS_PEDIATRIC.md`); S6 handled by the renamed verification streams (`tools/nonmem_verify/ped/`); S7 stated on the card and in the texts; S8 integrated by the app itself;
S9 below-quantification results are omitted, never entered as 0; S10 stated as a fixed line (built on EMIT, use the same assay; no field, no conversion); S11 no contradictory text.

Findings of the verification that are not in the papers: NONMEM `SS=1` with ADVAN6 is inaccurate for very fast absorption; the hand table of section 4.4 has Cmax and tmax rounded from a coarse grid (the
oracle values are used); the simulation of the 2026 benchmark gives a tacrolimus 3-point NRMSE of 16.3 % against 7.8 % published, unresolved (`RELEASE_NOTES_V150.md`).
