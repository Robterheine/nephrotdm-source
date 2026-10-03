# Independent verification team — de Winter 2008 implementation (v1.0.0)

**Principle:** nobody who built this reviews it. The five reviewers below take mandate,
artifacts and questions from this charter; their findings land in the verdict table at the
end. The team verifies *implementation correctness* (code = paper) and *assesses the
validation results* (calibration of record: `docs/CALIBRATION_RESULTS.md`).

**Submission under review:** the engine after the v1.0.1 methods audit (closed-form propagation,
exact steady state, converged sampler; see `docs/METHODS_AUDIT_V101.md`). Its calibration of
record is `docs/CALIBRATION_RESULTS.md` — the **n=100 per cell** F11 re-run at the shipped
defaults. The v1.0.1 record (8 pooled chains, 2 400 iterations; superseded) is kept as
`docs/CALIBRATION_RESULTS_V101.md`, with `docs/CALIBRATION_V101_SAMPLER_STUDY.md` (the paired
study that justified the 8-chain default) and the artifact (104 tests, strict verify gate, version 1.1.0), `docs/NONMEM_CROSSCHECK.md` and
`docs/RELEASE_NOTES_V110.md`.
The builders' execution logs are Parts 8–9 of the implementation plan; the v1.0.1
sampler-study JSONLs are at /tmp/calib_diagnosis_v101/ (volatile — the study document
is the durable record), the v1.0.0 diagnosis at /tmp/calib_diagnosis/.

**Artifacts every reviewer reads first:**
`docs/MODEL_ANALYSIS_DEWINTER_2008.md` (analysis + scrutiny S1–S12) ·
`docs/IMPLEMENTATION_PLAN_DEWINTER_2008.md` (the plan this build executed) ·
`docs/CALIBRATION_RESULTS.md` (V10 of record) · `src/model.js`, `src/bayes.js`,
`src/ui.js`, `src/diagnostics.js` · `tests/run_all.js` + `tests/golden.json` ·
the source paper (de Winter et al. 2008, *Clin Pharmacokinet* 47:827–838).

---

## Reviewer 1 — Independent senior pharmacometrician (population PK)

**Mandate:** does the code equal the published model, parameter by parameter?
**Protocol:** read the paper's final model (table III) against `src/model.js` line by line;
recompute the ω² table under both conventions (S1); check the mixture (51/32/17 at
0.95/1.88/4.83 h) and the evening/morning tlag semantics against the paper's equations 1–3;
check dose conversion (×0.739/×0.936) against Table II; verify the model card in About
states scope honestly (maintenance-phase population, FO method, pooled assay).
**Must answer:**
1. Is any published parameter mistranscribed, or any unit silently converted?
2. Is the √ω² convention defensible for ka/V2 (ω² 3.50/24.0)? Would the exact-log-normal
   column change any clinical decision the app can produce?
3. Is the subject-level (not per-dose) formulation decision honest to the source data?
4. Is the S12 window-periodicity handling (morning vs evening anchoring, caveat shown)
   clinically acceptable, or should v1.1 auto-anchor at the morning dose?
**Acceptance:** zero mistranscriptions; S1/S12 judgments recorded with rationale.

## Reviewer 2 — Independent Bayesian statistician

**Mandate:** is the inference machinery correct, and are the calibration results credible?
**Protocol:** audit `makeOfv` (prior term, −2·ln p_m membership prior, log-scale residual,
M3 on ln-scale), `runMCMCMix` (membership Metropolis-within-Gibbs: proposal from the prior,
Hastings ratio, switch diagnostic), joint MAP over subgroups, the marginal AUC chain;
then interrogate `docs/CALIBRATION_RESULTS.md`: coverage per cell vs the 85–95% band at the
achieved n (now n=100 per cell, SE ≈ 3%), interval widths trough-vs-LSS (trough should be wider, coverage held),
membership recovery vs the 51% prior-mode baseline, switch rates > 0, ESS values, and both
robustness arms (S1 convention, correlated-truth vs diagonal-Ω fit).
**Must answer:**
1. Does the membership move satisfy detailed balance as implemented?
2. The v1.0.0 record ran at n=40/n=20 (SE ≈ 5–11%); v1.0.1 re-runs at n=100 (SE ≈ 3%).
   Does the full-size record settle the v1.0.0 CHECK cells (trough arms, arm cells),
   and is any remaining CHECK a genuine sampler/model issue rather than small-n noise?
3. Do the robustness arms actually demonstrate AUC-benignity of S1 and the diagonal-Ω?
4. Are ESS values on the kept (thinned) chain reported honestly as such?
**Acceptance:** any defect in the sampler is a blocking finding; calibration caveats are
graded (blocking / note / accept).

## Reviewer 3 — Numerical analyst

**Mandate:** can the numbers be trusted at the stated tolerance?
**Protocol:** audit the DOPRI(5,4) implementation and tolerances against the analytic
2-compartment bolus solution (V3 asserts 0.2% — re-derive independently); the trapezoid
AUC error budget (grid 48 per 12 h window; sharp EC-MPS onset); the SS-depth arithmetic
(S2: measured 7.6% deficit at 10 doses / 6.2% at 11, within-tolerance at n=30; audit F15 corrected the earlier 4.4%); the 24h-periodicity
invariant closure (0.06%); `aucFromConc` Δt handling.
**Must answer:**
1. Is ±2% on the golden anchors justified by the composed error budget, with margin?
2. Any stiffness regime (ka 4.1 vs k21 0.042 /h) where the adaptive step control can fail
   silently?
3. Is the AUC₁₂ normalization (×12/x per draw) exact under the trapezoid grid actually used?
**Acceptance:** error budget confirmed or re-derived; no unbounded error path.

## Reviewer 4 — Clinical pharmacologist / TDM practitioner

**Mandate:** can a clinician use this safely and understand what they see?
**Protocol:** walk the app end-to-end for an MMF patient and an EC-MPS patient; check the
window fold statement (AUC₀–12h at steady state), the EC-MPS sampling warning, the
model-identity chip, the membership probabilities wording ("probabilities, not a
classification"), the shrinkage honesty note, the printed report (dual units, model line,
disclaimers), Getting-started and MPA TDM background against the IATDMCT consensus.
**Must answer:**
1. Any screen where a busy clinician could misread an AUC as a dose recommendation, or an
   evening-anchored EC-MPS AUC as target-comparable?
2. Is the ~30–60 s runtime with progress acceptable at the bedside, or must v1.1 speed up?
3. Is the maintenance-phase scope sufficiently visible for early post-transplant use?
**Acceptance:** no misleading screen; caveats judged sufficient or listed for v1.1.

## Reviewer 5 — Software auditor

**Mandate:** engineering discipline, security, honesty of the test suite.
**Protocol:** verify the single-file offline claim (no CDNs/network in `mpa-tdm.html`);
user-text escaping in every generated HTML surface (report, tables, modals, tooltips);
session import round-trip; the can-go-red discipline (the CL-sabotage record in the build
log; any test that cannot fail); version sync; print stylesheet integrity; the golden.json
provenance comments.
**Must answer:**
1. Any path where user input reaches innerHTML unescaped?
2. Any test assertion that is tautological or cannot go red?
3. Does the built artifact differ from `index.html` + `src/*` in any unexplained way?
**Acceptance:** zero unescaped paths; every test can fail; artifact reproducible.

---

## Verdict table (filled by the team)

| Reviewer | Blocking findings | Notes / v1.1 items | Verdict |
|---|---|---|---|
| R1 pharmacometrician | — | Not reviewed by a named person. Cross-reference: methods audit §1 and F8/F19; Table III of the paper was compared with `src/model.js` (2026-09-20) and every model-4 value matches | pending |
| R2 statistician | — | Not reviewed by a named person. Cross-reference: audit F1/F2/F7/F11 (sampler budget, membership move, convergence diagnostics, calibration re-run) — all addressed after v1.0.1 | pending |
| R3 numerical analyst | — | Not reviewed by a named person. Cross-reference: audit OK1–OK5, F9/F21/F20 (closed-form propagation, exact steady state; the RK45 solver stays as the cross-check oracle) | pending |
| R4 clinician | — | Not reviewed by a named person. Cross-reference: audit F3/F18/F23 and the model-card additions; the clinical-window question (30–60 mg·h/L, ciclosporin-era evidence) is not covered | pending |
| R5 software auditor | — | Not reviewed by a named person. Cross-reference: audit F4/F5/F6/F10/F12–F17 | pending |

**Overall release verdict:** pending — require zero blocking findings from R1–R3 and R5;
R4 may gate on presentation severity.

**Status of the gate (audit finding F14, recorded 2026-09-20).** v1.0.1 shipped without this table
being completed: the gate was neither satisfied nor formally waived. `docs/METHODS_AUDIT_V101.md`
is an internal, AI-assisted methods audit of the shipped code; it answers questions in R1, R2, R3
and R5 and part of R4, and its findings have since been fixed, but it is **not independent
human review** and is not counted here. The verdict cells stay `pending` until named reviewers
sign them; whether to release without them is the owner's decision. Reviewers should start from the
audit, `docs/CALIBRATION_RESULTS.md` (the F11 re-run; the v1.0.1 record is kept as
`docs/CALIBRATION_RESULTS_V101.md`) and the paper.


---

## Addendum — tacrolimus (NephroTDM 1.2.x), 2 October 2026

The charter above was written for the MPA model. The tacrolimus model (`src/tacrolimus.js`, Størset 2014) has **not
been reviewed by any named person** either; its verdicts are `pending` on the same terms. What exists, for a reviewer
to start from: `docs/IMPLEMENTATION_PLAN_STORSET_2014.md` (with its execution log), `docs/MODEL_ANALYSIS_STORSET_2014.md`
(the transcription record), `docs/CALIBRATION_RESULTS_STORSET.md`, `tools/nonmem_verify/tac/` (NONMEM 7.6 structural and
POSTHOC cross-check), `docs/RELEASE_NOTES_V120.md`, and the source paper. Questions specific to this model:
1. (R1) Is every Table 2 value and the Equation 3 binding term transcribed correctly, and is the √ω² reading of the CVs, the
   0.27 V1–Q correlation and the calendar-day occasion acceptable? 2. (R2) Is a per-sampled-day κ on F and ka, with unsampled days
   at zero, an acceptable approximation to the paper's BOV? Is the calibration (coverage of the steady-state exposure at κ = 0) the
   right quantity to calibrate? 3. (R4) Is leaving the first-day effect out acceptable with the stated scope, and is a window-less
   forecast (no default AUC or trough window; consensus text not read) acceptable? Is the haematocrit-corrected value, with no
   validated target, safe to show beside the actual one? 4. (R5) Do the new report, session and drug-switch paths escape all
   user text and never carry one drug's window to the other?


---

## Addendum — everolimus (NephroTDM 1.4.0), 3 October 2026

The everolimus model (`src/everolimus.js`, Model 3 of Zwart 2021) has **not been reviewed by any named person**; its verdicts are `pending` on the same terms. The model's last author
answered the transcription and scope questions (`docs/HANDOFF_EVEROLIMUS_M3.md`, §1 and §11). What exists, for a reviewer to start from: the hand-off with every decision, `docs/SOURCE_ANALYSIS_EVR_CONSENSUS_ZWART.md`,
`docs/CALIBRATION_RESULTS_EVR.md`, `tools/nonmem_verify/evr/` (NONMEM 7.6 structural and POSTHOC check, run as tests from stored fixtures), `docs/RELEASE_NOTES_V140.md` and the two source papers.
Questions specific to this model:
1. (R1) Are the ESM values and the Eq. 1 to 3 binding terms transcribed correctly (the code's mg/L constants read as ×1000 µg/L), and is the corrected value as "the same plasma curve read at haematocrit 0.38" the right definition?
2. (R2) Is one haematocrit for the pharmacokinetic path (the latest sample's), with each sample's own for the blood reading, an acceptable approximation to NONMEM's record-wise haematocrit (mean 1.0 %, max 6.2 % in earlier samples)?
3. (R4) Is a run without a sample acceptable with the labelling and the a priori accuracy stated in About (AUC over-predicted by about 43 %)? Is showing the corrected value beside the actual one, with no AUC window and the two consensus trough sets, safe?
4. (R5) Do the report, session and drug-switch paths of the third drug escape all user text and never carry one drug's window or covariate to another?
