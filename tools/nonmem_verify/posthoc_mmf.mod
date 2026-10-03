$PROBLEM POSTHOC (EBE) for MMF, de Winter 2008: every parameter FIXED, MAXEVAL=0 (individual estimates only)
$INPUT ID TIME AMT EVID MDV SS II CLK DV
$DATA post_mmf.csv IGNORE=@
$SUBROUTINES ADVAN4 TRANS4
$PK
 CL    = 16*EXP(ETA(1))
 Q     = 22*EXP(ETA(2))
 V2    = 40*EXP(ETA(3))      ; central  (V1 in the paper)
 V3    = 518*EXP(ETA(4))     ; peripheral (V2 in the paper)
 KA    = 4.1*EXP(ETA(5))
 ALAG1 = 0.30*EXP(ETA(6))
 S2    = V2
$ERROR
 IPRED = F
 IF (IPRED.LT.1E-12) IPRED = 1E-12
 Y = LOG(IPRED) + EPS(1)      ; DV is ln(concentration)
$THETA (0 FIX)
; omega^2 exactly as the app: (CV/100)^2 — the "sqrt(omega^2)" reading of Table III
$OMEGA 0.1521 FIX            ; CL   39 %
$OMEGA 0.6084 FIX            ; Q    78 %
$OMEGA 1.0    FIX            ; V1  100 %
$OMEGA 24.01  FIX            ; V2  490 %
$OMEGA 3.4969 FIX            ; ka  187 %
$OMEGA 0.0121 FIX            ; tlag 11 %
$SIGMA 0.1521 FIX            ; 0.39^2, additive on ln(C)
$ESTIMATION METHOD=1 MAXEVAL=0 NOABORT SIGL=9 PRINT=1
$TABLE ID TIME EVID IPRED ETA1 ETA2 ETA3 ETA4 ETA5 ETA6 NOPRINT ONEHEADER NOAPPEND FORMAT=s1PE15.8 FILE=post_mmf.tab
