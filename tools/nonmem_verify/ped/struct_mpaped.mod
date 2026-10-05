$PROBLEM Structural check, pediatric MPA (Heida 2024): run 57 structure, ARTICLE values, etas supplied as data (no estimation)
; Derived from mpa_ped_run57.ctl: ETA(1) CL -> E1, ETA(2) V2 -> E2, ETA(4) Q -> E4, IOV(OCC) -> EO (the occasion's eta, given on every record;
; the OCC -> ETA(5+OCC) lookup of the run is a trivial IF chain, its counterpart is tested in the app's occasion tests).
; Dose in mg MMF, concentration mg/L MPA, no unit conversion.
$INPUT ID TIME AMT EVID CMT MDV SS II WT ALB E1 E2 E4 EO DV
$DATA struct_mpaped.csv IGNORE=@
$SUBROUTINE ADVAN5
$MODEL COMP=(DOSE) COMP=(CENTRAL) COMP=(PERIPHERAL) COMP=(TRAN)
$PK
ALLOCL=(WT/70)**0.75
ALLOV=(WT/70)
ALLOK=(WT/70)**(-0.25)
COVALB=(ALB/34)**(-2.49)
CL=16.0*ALLOCL*COVALB*EXP(E1)
V2=24.9*ALLOV*EXP(E2)
V3=1590*ALLOV
Q=36.2*ALLOCL*EXP(E4)
KTR=1.48*ALLOK
F1=1*EXP(EO)
S2=V2
K14=KTR
K42=KTR
K23=Q/V2
K32=Q/V3
K20=CL/V2
$ERROR
IPRED=F
Y=IPRED+EPS(1)
$THETA (0 FIX)
$OMEGA 0 FIX
$SIGMA 0.1 FIX
$ESTIMATION METHOD=0 MAXEVAL=0 NOABORT
$TABLE ID TIME IPRED NOPRINT ONEHEADER NOAPPEND FORMAT=s1PE15.8 FILE=struct_mpaped.tab
