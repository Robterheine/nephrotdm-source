/* Records fixed-seed tacrolimus results to tests/tac_v121_regression.json (the bit-identity baseline for optimisations).
 *   node tools/record_tac_regression.mjs > tests/tac_v121_regression.json
 * Re-record only for an intended change to the numbers, and say why in the release notes. */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version','model','tacrolimus','bayes','parallel'].forEach(f => require(resolve(here, '../src/' + f + '.js')));
const {model:M,bayes:B}=globalThis.ECU;
const ex={sex:'m',ht:175,pred:'10',hct:'0.33',assay:'lcms',cyp3a5:'unknown'}, tEnd=24*40+8;
const ss=()=>M.ssHistory({amt:3000,intervalHours:12,tEnd,n:30});
const cases={
 ss_profile3:{drug:'tac',wt:80,extra:ex,doses:ss(),steadyState:true,obs:[{t:tEnd,c:3.9,hct:.33},{t:tEnd+1,c:9.6,hct:.33},{t:tEnd+3,c:10.4,hct:.31}],intervalHours:12,winLo:80,winHi:150,troughLo:4,troughHi:8,seed:11,mcmcIters:160000},
 hist_troughs3:{drug:'tac',wt:66,extra:Object.assign({},ex,{sex:'f',ht:164,assay:'cmia',cyp3a5:'expresser'}),doses:(()=>{const d=[];for(let k=0;k<30;k++)d.push({t:tEnd-12*(29-k),amt:2500+500*(k%3===0),route:'oral',pred:k<10?20:10});return d;})(),steadyState:false,obs:[2,1,0].map((k,i)=>({t:tEnd-24*k,c:6+0.8*i,hct:0.30+0.01*i})),intervalHours:12,seed:5,mcmcIters:160000},
 population:{drug:'tac',wt:70,extra:Object.assign({},ex,{sex:'f',ht:165}),doses:ss(),steadyState:true,obs:[],intervalHours:12,seed:3,priorDraws:3000}
};
(async()=>{
 const out={};
 for(const k of Object.keys(cases)){
  const f=await B.runFit(cases[k],null);
  out[k]={auc:[f.auc.p5,f.auc.median,f.auc.p95,f.auc.pInWindow],tr:[f.trough.p5,f.trough.median,f.trough.p95,f.trough.pInWindow],aucC:[f.aucCorr.p5,f.aucCorr.median,f.aucCorr.p95],trC:[f.troughCorr.p5,f.troughCorr.median,f.troughCorr.p95],acc:f.acceptance,nDraws:f.nDraws,mapEta:f.map?f.map.eta:null,mapOfv:f.map?f.map.ofv:null,band:[f.chartBand.median[3],f.chartBand.p95[10]],conv:f.convergence?[f.convergence.rhat,f.convergence.essMin]:null};
  if(k==='ss_profile3'){ const sc=await B.doseScan({draws:f.draws,drug:'tac',wt:80,extra:f.extra,tEnd,amounts:[2000,3000,4000],intervalHours:12,pred:10,hct:0.31,assay:'lcms',winLo:80,winHi:150,troughLo:4,troughHi:8}); out.scan=sc.map(r=>[r.amt,r.auc.median,r.auc.p5,r.auc.pInWindow,r.trough.median,r.aucCorr.median]); }
 }
 console.log(JSON.stringify(out));
})();
