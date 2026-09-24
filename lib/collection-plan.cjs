'use strict';
// Work items within one execution, not independent schedulers or publication jobs.
function collectionPlan(config, documents) {
  if (!Array.isArray(config?.required) || !config.usPools || !Array.isArray(documents)) {
    throw Error('Invalid collection inputs');
  }
  const pools=Object.values(config.usPools);
  if (pools.some(pool=>!Array.isArray(pool))) throw Error('Invalid candidate pool');
  const candidates=[...new Set(pools.flat())].map(symbol=>({
    id:'EQUITY:US:'+symbol,symbol,name:symbol,market:'US',currency:'USD'
  }));
  const lanes=[
    {id:'required-quotes',jobs:config.required.map(item=>({kind:'quote',item}))},
    {id:'news-documents',jobs:[]},
    {id:'macro-documents',jobs:[]},
    {id:'candidate-quotes',jobs:candidates.map(item=>({kind:'quote',item}))},
    {id:'research-documents',jobs:[]}
  ];
  documents.forEach((document,index)=>{
    const lane=document?.kind==='research'?4:['macro','official'].includes(document?.kind)?2:1;
    lanes[lane].jobs.push({kind:'document',index});
  });
  const jobs=[];
  for(let row=0;lanes.some(lane=>row<lane.jobs.length);row++) {
    for(const lane of lanes) if(row<lane.jobs.length) jobs.push({...lane.jobs[row],lane:lane.id});
  }
  return {jobs,lanes:lanes.map(({id,jobs})=>({id,requested:jobs.length})),quoteCount:config.required.length+candidates.length};
}
module.exports={collectionPlan};
