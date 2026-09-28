'use strict';
// Repository permission is independent of the external scheduler's enabled state.
const groups=new Set(['global-main','asia-session','us-session']);
function assertTaskAllowed(control,group){
 const deny=message=>{throw Object.assign(Error(message),{code:'PRODUCTION_PAUSED'});};
 if(!control||control.version!==1||control.productionPaused!==false||control.executionProtocol!=='lease-v1')deny('Production remains paused or the execution protocol is not enabled');
 if(group===undefined)return control;
 if(!groups.has(group))deny('Unknown task group');
 const policy=control.supervisedAcceptance;
 if(policy?.enabledTaskGroups!==undefined){
  if(!Array.isArray(policy.enabledTaskGroups)||policy.enabledTaskGroups.some(x=>!groups.has(x))||!policy.enabledTaskGroups.includes(group))deny('Task group is not authorized by the production control: '+group);
 }
 if(policy?.pausedTaskGroups!==undefined){
  if(!Array.isArray(policy.pausedTaskGroups)||policy.pausedTaskGroups.some(x=>!groups.has(x))||policy.pausedTaskGroups.includes(group))deny('Task group is paused by the production control: '+group);
 }
 return control;
}
module.exports={assertTaskAllowed};
