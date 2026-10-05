$PROBLEM Structural check, pediatric tacrolimus (Schijvens 2020, refit Heida 2026 ESM S1): etas supplied as data (no estimation)
; Derived from tac_ped_published.ctl: ETA(2) KA -> E1, ETA(3) CLINT -> E2, ETA(4) V3 -> E3 (ETA(1), the IIV on F, is fixed to 0 and absent);
; compartment DOSE renamed DEPOT and the AUC compartment dropped (the comparison integrates the predicted curve itself);
; both THETA(1) (capsule) and THETA(2) (suspension) used as in the published code; F1 = THETA(7)**FORM. Dose ug, concentration ug/L.
$INPUT ID TIME AMT EVID CMT MDV SS II WT HT FORM E1 E2 E3 DV
$DATA struct_tacped.csv IGNORE=@
$SUBROUTINES ADVAN6 TOL=9
$MODEL
COMP=(DEPOT)
COMP=(LIVER)
COMP=(CENTRAL)
COMP=(PERI)
COMP=(TRAN)
COMP=(TRAN2)
$PK
CLWT=(WT/70)**0.75
VWT=(WT/70)
VL=0.0437*(WT**0.9)
F1=1*(0.46**FORM)
IF (FORM.EQ.0) KA=2.83*EXP(E1)
IF (FORM.EQ.1) KA=18*EXP(E1)
QHP=90*(1-HT)*CLWT
FU=1
CLINT=987*CLWT*EXP(E2)
EH=(CLINT*FU)/(QHP+(CLINT*FU))
CLH=EH*QHP
V3=508*VWT*EXP(E3)
V4=487*VWT
Q=112*CLWT
S3=V3
K15=KA
K56=KA
K62=KA
K20=CLH/VL
K23=(QHP*(1-EH))/VL
K32=QHP/V3
K34=Q/V3
K43=Q/V4
$DES
DADT(1)=-K15*A(1)
DADT(5)=-K56*A(5)+K15*A(1)
DADT(6)=-K62*A(6)+K56*A(5)
DADT(2)=-K20*A(2)-K23*A(2)+K62*A(6)+K32*A(3)
DADT(3)=-K32*A(3)-K34*A(3)+K23*A(2)+K43*A(4)
DADT(4)=-K43*A(4)+K34*A(3)
$ERROR
CPL=F
BMAX=418
KD=3.8
CWB=CPL*(1+((BMAX*HT)/(CPL+KD)))
IPRED=CWB
Y=IPRED+EPS(1)
$THETA (0 FIX)
$OMEGA 0 FIX
$SIGMA 0.1 FIX
$ESTIMATION METHOD=0 MAXEVAL=0 NOABORT
$TABLE ID TIME IPRED CPL NOPRINT ONEHEADER NOAPPEND FORMAT=s1PE15.8 FILE=struct_tacped.tab
