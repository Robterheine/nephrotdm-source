$PROBLEM Structural check, MMF: de Winter 2008 model, etas supplied as data (no estimation)
$INPUT ID TIME AMT EVID MDV SS II CLK MX E1 E2 E3 E4 E5 E6 E7 DV
$DATA struct_mmf.csv IGNORE=@
$SUBROUTINES ADVAN4 TRANS4
$PK
 CL   = 16*EXP(E1)
 Q    = 22*EXP(E2)
 V2   = 40*EXP(E3+ETA(1))   ; ETA(1) is a dummy fixed at 0: it only makes NM-TRAN treat this as a population data set (ID recognised)      ; central (V1 in the paper)
 V3   = 518*EXP(E4)     ; peripheral (V2 in the paper)
 KA   = 4.1*EXP(E5)
 ALAG1 = 0.30*EXP(E6)
 S2   = V2
$ERROR
 IPRED = F
 Y = IPRED + EPS(1)
$THETA (0 FIX)
$OMEGA 0 FIX
$SIGMA 0.1 FIX
$ESTIMATION METHOD=0 MAXEVAL=0 NOABORT
$TABLE ID TIME IPRED NOPRINT ONEHEADER NOAPPEND FORMAT=s1PE15.8 FILE=struct_mmf.tab
