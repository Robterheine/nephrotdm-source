$PROBLEM Structural check, EC-MPS: morning lag subgroup MX (1..3) given as data, etas as data
$INPUT ID TIME AMT EVID MDV SS II CLK MX E1 E2 E3 E4 E5 E6 E7 DV
$DATA struct_ecmps.csv IGNORE=@
$SUBROUTINES ADVAN4 TRANS4
$PK
 CL   = 16*EXP(E1)
 Q    = 22*EXP(E2)
 V2   = 40*EXP(E3+ETA(1))   ; ETA(1) is a dummy fixed at 0: it only makes NM-TRAN treat this as a population data set (ID recognised)
 V3   = 518*EXP(E4)
 KA   = 3.0*EXP(E5)
 ; lag depends on the clock hour of the dose (morning window 06:00-18:00), as in the app
 IF (MX.EQ.1) TLM = 0.95
 IF (MX.EQ.2) TLM = 1.88
 IF (MX.EQ.3) TLM = 4.83
 IF (CLK.GE.6 .AND. CLK.LT.18) THEN
   ALAG1 = TLM*EXP(E6)
 ELSE
   ALAG1 = 9.04*EXP(E7)
 ENDIF
 S2   = V2
$ERROR
 IPRED = F
 Y = IPRED + EPS(1)
$THETA (0 FIX)
$OMEGA 0 FIX
$SIGMA 0.1 FIX
$ESTIMATION METHOD=0 MAXEVAL=0 NOABORT
$TABLE ID TIME IPRED NOPRINT ONEHEADER NOAPPEND FORMAT=s1PE15.8 FILE=struct_ecmps.tab
