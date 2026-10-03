$PROBLEM POSTHOC (EBE) for EC-MPS, de Winter 2008: morning lag mixture (51/32/17 %), every parameter FIXED, MAXEVAL=0
$INPUT ID TIME AMT EVID MDV SS II CLK DV
$DATA post_ecmps.csv IGNORE=@
$SUBROUTINES ADVAN4 TRANS4
$MIX
 NSPOP = 3
 P(1)  = THETA(1)
 P(2)  = THETA(2)
 P(3)  = 1 - THETA(1) - THETA(2)
$PK
 CL    = 16*EXP(ETA(1))
 Q     = 22*EXP(ETA(2))
 V2    = 40*EXP(ETA(3))
 V3    = 518*EXP(ETA(4))
 KA    = 3.0*EXP(ETA(5))
 IF (MIXNUM.EQ.1) TLM = 0.95
 IF (MIXNUM.EQ.2) TLM = 1.88
 IF (MIXNUM.EQ.3) TLM = 4.83
 IF (CLK.GE.6 .AND. CLK.LT.18) THEN
   ALAG1 = TLM*EXP(ETA(6))    ; morning dose: mixture lag
 ELSE
   ALAG1 = 9.04*EXP(ETA(7))   ; evening dose
 ENDIF
 S2    = V2
$ERROR
 IPRED = F
 IF (IPRED.LT.1E-12) IPRED = 1E-12
 Y = LOG(IPRED) + EPS(1)
 MEST = MIXEST               ; the individual's most probable subpopulation (copied so $TABLE can print it)
$THETA (0.51 FIX) (0.32 FIX)
$OMEGA 0.1521 FIX            ; CL
$OMEGA 0.6084 FIX            ; Q
$OMEGA 1.0    FIX            ; V1
$OMEGA 24.01  FIX            ; V2
$OMEGA 3.4969 FIX            ; ka
$OMEGA 0.0064 FIX            ; tlag morning  8 %
$OMEGA 0.16   FIX            ; tlag evening 40 %
$SIGMA 0.1521 FIX
$ESTIMATION METHOD=1 MAXEVAL=0 NOABORT SIGL=9 PRINT=1
$TABLE ID TIME EVID IPRED ETA1 ETA2 ETA3 ETA4 ETA5 ETA6 ETA7 MEST NOPRINT ONEHEADER NOAPPEND FORMAT=s1PE15.8 FILE=post_ecmps.tab
