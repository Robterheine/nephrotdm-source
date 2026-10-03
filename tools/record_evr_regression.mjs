/* Records fixed-seed everolimus results to tests/evr_regression.json (the bit-identity baseline for later changes).
 *   node tools/record_evr_regression.mjs > tests/evr_regression.json
 * Re-record only for an intended change to the numbers, and say why in the release notes. */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version','model','everolimus','bayes','parallel'].forEach(f => require(resolve(here, '../src/' + f + '.js')));
const {model:M,bayes:B}=globalThis.ECU;
const tEnd=24*20+8, ss=()=>M.ssHistory({amt:1500,intervalHours:12,tEnd,n:30});
const cases={
 ss_trough_peak:{drug:'evr',extra:{hct:'0.33',predHigh:'low'},doses:ss(),steadyState:true,obs:[{t:tEnd,c:3.6,hct:.33},{t:tEnd+2,c:11.2,hct:.31}],intervalHours:12,troughLo:3,troughHi:8,seed:11,mcmcIters:160000},
 hist_troughs3:{drug:'evr',extra:{hct:'0.40',predHigh:'high'},doses:(()=>{const d=[];for(let k=0;k<30;k++)d.push({t:tEnd-12*(29-k),amt:1000+500*(k>14),route:'oral'});return d;})(),steadyState:false,obs:[2,1,0].map((k,i)=>({t:tEnd-24*k,c:3+0.5*i,hct:0.38+0.01*i})),intervalHours:12,seed:5,mcmcIters:160000},
 population:{drug:'evr',extra:{hct:'0.38',predHigh:'low'},doses:ss(),steadyState:true,obs:[],intervalHours:12,seed:3,priorDraws:3000}
};
(async()=>{
 const out={};
 for(const k of Object.keys(cases)){
  const f=await B.runFit(cases[k],null);
  out[k]={auc:[f.auc.p5,f.auc.median,f.auc.p95,f.auc.pInWindow],tr:[f.trough.p5,f.trough.median,f.trough.p95,f.trough.pInWindow],aucC:[f.aucCorr.p5,f.aucCorr.median,f.aucCorr.p95],trC:[f.troughCorr.p5,f.troughCorr.median,f.troughCorr.p95],acc:f.acceptance,nDraws:f.nDraws,mapEta:f.map?f.map.eta:null,mapOfv:f.map?f.map.ofv:null,conv:f.convergence?[f.convergence.rhat,f.convergence.essMin]:null};
  if(k==='ss_trough_peak'){ const sc=await B.doseScan({draws:f.draws,drug:'evr',extra:f.extra,tEnd,amounts:[1000,1500,2000],intervalHours:12,troughLo:3,troughHi:8}); out.scan=sc.map(r=>[r.amt,r.auc.median,r.auc.p5,r.trough.median,r.trough.pInWindow,r.aucCorr.median]); }
 }
 console.log(JSON.stringify(out));
})();
