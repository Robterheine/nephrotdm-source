$PROBLEM Structural check, everolimus Model 3 (Zwart 2021 ESM): etas supplied as data (no estimation)
; Derived from model3.ctl: ETA(1) CLINT -> E1, ETA(2) V3 -> E2, ETA(5) FU -> E3; IOV (ETA(3), ETA(4)) is zero in Model 3;
; compartment names TRAN1..TRAN4 (the supplement names all four TRAN, which NMTRAN 7.6 refuses: error 52);
; the virtual AUC compartments are dropped (the comparison integrates the predicted curve itself).
; Dose in mg, concentrations in mg/L (as in the supplement). HT is the record's haematocrit; STUDY=4 flags "high-dose prednisolone".
$INPUT ID TIME AMT EVID MDV SS II HT STUDY E1 E2 E3 DV
$DATA struct_evr.csv IGNORE=@
$SUBROUTINES ADVAN6 TOL=9
$MODEL
 COMP=(DOSE)
 COMP=(LIVER)
 COMP=(CENTRAL)
 COMP=(PERIPH)
 COMP=(TRAN1)
 COMP=(TRAN2)
 COMP=(TRAN3)
 COMP=(TRAN4)
$PK
 VL=1.55
 FLA4=0
 IF (STUDY.EQ.4) FLA4=1
 F1=1
 MAT=0.549
 KA=5/MAT
 FU=0.27*EXP(E3)
 QH=90
 QHP=QH*(1-HT)
 TVCLINT=322*(1.44**FLA4)
 CLINT=TVCLINT*EXP(E1)
 V3=266*EXP(E2)
 Q=79.5
 V4=519
 S3=V3
 EH=(CLINT*FU)/(QHP+(CLINT*FU))
 CLH=EH*QHP
 K15=KA
 K56=K15
 K67=K56
 K78=K67
 K82=K78
 K20=CLH/VL
 K23=(QHP*(1-EH))/VL
 K32=QHP/V3
 K34=Q/V3
 K43=Q/V4
$DES
 DADT(1)=-K15*A(1)
 DADT(2)=-K20*A(2)-K23*A(2)+K82*A(8)+K32*A(3)
 DADT(3)=-K32*A(3)-K34*A(3)+K23*A(2)+K43*A(4)
 DADT(4)=-K43*A(4)+K34*A(3)
 DADT(5)=-K56*A(5)+K15*A(1)
 DADT(6)=-K67*A(6)+K56*A(5)
 DADT(7)=-K78*A(7)+K67*A(6)
 DADT(8)=-K82*A(8)+K78*A(7)
$ERROR
 CPL=F
 BMAX=0.96425
 KD=0.09195
 KNS=0.15336
 CRB=((BMAX*CPL)/(KD+CPL))+(KNS*CPL)
 CBL=(CRB*HT)+(CPL*(1-HT))
 IPRED=CBL
 Y=IPRED+EPS(1)
$THETA (0 FIX)
$OMEGA 0 FIX
$SIGMA 0.1 FIX
$ESTIMATION METHOD=0 MAXEVAL=0 NOABORT
$TABLE ID TIME IPRED CPL NOPRINT ONEHEADER NOAPPEND FORMAT=s1PE15.8 FILE=struct_evr.tab
