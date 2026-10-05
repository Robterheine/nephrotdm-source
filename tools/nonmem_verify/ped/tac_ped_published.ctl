; Tacrolimus, pediatric kidney transplant recipients: the model of Schijvens AM, de Wildt SN, Cornelissen EAM, van Hesteren FHS,
; Schreuder MF, Ter Heine R. Clin Pharmacokinet 2020;59:1483 (low bioavailability of oral tacrolimus suspension), as REFITTED with
; weight and haematocrit as the only covariates in Heida A et al., Clin Pharmacokinet 2026 (doi 10.1007/s40262-026-01708-3), ESM S1.
; Copied VERBATIM from that ESM (CC BY-NC 4.0). Do not edit; see docs/HANDOFF_PEDIATRIC.md section 4.2.
; $INPUT and $DATA are empty in the published text; MAXEVAL=0 with POSTHOC means the THETA values below are the final estimates.
$INPUT 
; AMOUNTS AND CONC IN UG AND L, FORM 1=SUSPENSION 0=CAPSULE

$DATA 

$SUBROUTINES ADVAN6 TOL=3

$MODEL 
COMP=(DOSE) 
COMP=(LIVER)
COMP=(CENTRAL)
COMP=(PERI)
COMP=(TRAN)
COMP=(TRAN2)
COMP=(AUC)

$PK 
; ALLOMETRIC SCALING
CLWT=(WT/70)**0.75
VWT=(WT/70)
; LIVER VOLUME - http://www.ncbi.nlm.nih.gov/pubmed/16315293  model 2b
VL= 0.0437*(WT**0.9)

; ABSORPTION
F1=1*(THETA(7)**FORM)*EXP(ETA(1))		
; RELATIVE F1 FORM=1 IS SUSPENSION
IF (FORM.EQ.0) KA		=	THETA(1)*EXP(ETA(2))		;	ABSORPTION
IF (FORM.EQ.1) KA		=	THETA(2)*EXP(ETA(2))		;	ABSORPTION

; WELL-STIRRED LIVER MODEL 
QHP=90*(1-HT)*CLWT					;	HEPATIC PLASMA FLOW, 90 L/H ALLOMETRICALLY SCALED HT
FU=1							; 	FRACTION UNBOUND https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3498613/
TVCLINT=THETA(3)*CLWT				; 	INTRINSIC CLEARANCE
CLINT=TVCLINT*EXP(ETA(3))				;	INTRINSIC CLEARANCE			
EH=(CLINT*FU)/(QHP+(CLINT*FU))			; 	HEPATIC EXTRACTION
CLH=EH*QHP						; 	HEPATIC CLEARANCE

; DISTRIBUTION
TVV3=THETA(4)*VWT
V3=TVV3*EXP(ETA(4))
V4=THETA(5)*VWT
Q=THETA(6)*CLWT

; SCALING
S3=V3

; MASS TRANSPORT
K15=KA
K56=KA
K62=KA
K20=CLH/VL
K23=(QHP*(1-EH))/VL
K32=QHP/V3
K34=Q/V3
K43=Q/V4

;TTIME  AFTER DOSE
IF (NEWIND.LE.1) THEN
DOSE=0
TDOS=0
ENDIF
;Remember dose and time of dose
IF (AMT.GT.0) THEN
DOSE=AMT
TDOS=TIME
ENDIF
;Time after dose for every record
TAD=TIME-TDOS

$DES ;AUC calculation
DADT(1)=-k15*A(1)
DADT(5)=-k56*A(5)+k15*A(1)
DADT(6)=-k62*A(6)+k56*A(5)
DADT(2)=-k20*A(2)-k23*A(2)+k62*A(6)+k32*A(3)
DADT(3)=-k32*A(3)-k34*A(3)+k23*A(2)+k43*A(4)
DADT(4)=-k43*A(4)+k34*A(3)

C3=A(3)/V3

C3WBL=C3*(1+((418*HT)/(C3+3.8)))

DADT(7)=C3WBL


$ERROR 
; BLOOD BINDING https://www.ncbi.nlm.nih.gov/pubmed/7535213 & https://www.ncbi.nlm.nih.gov/pubmed/30374607

CPL=F		; CALCULATES PLASMA PK

BMAX=418	; BMAX UG/L
KD=3.8		; KD UG/L

CWB=CPL*(1+((BMAX*HT)/(CPL+KD)))

IPRED=CWB

Y=IPRED+IPRED*ERR(1)


AUC=A(7)

$THETA
(0, 2.83) ; KA
(0, 18) ; KA
(0, 987) ; CLINT
(0, 508) ; V3
(0, 487) ; V4
(0, 112) ; Q
(0, 0.46) ; FOR-F

$OMEGA 
 0 FIX  ; IIV F
 0.644 ; IIV KA
 0.456 ; IIV CLINT
 0.692 ; IIV V3

$SIGMA 
 0.0374 ; PROP ERR

$ESTIMATION MAXEVAL=0 NOABORT POSTHOC PRINT=5 METH=1 INTERACTION
