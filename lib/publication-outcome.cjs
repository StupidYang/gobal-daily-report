'use strict';
// Repository commit and public deployment are independent facts.
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function receiptMatches(state, receipt) {
  return receipt?.status === 'published' && receipt.batchId === state.batchId &&
    receipt.taskGroup === state.taskGroup && receipt.inputHash === state.batchHash &&
    /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(receipt.reportId || '');
}
function classify(state, receipt, { proof, workflowRunId, jobStatus, now = Date.now() } = {}) {
  const repositoryPublished = receiptMatches(state, receipt);
  const deployed = repositoryPublished && jobStatus === 'success' &&
    proof?.status === 'verified' && proof.workflowRunId === workflowRunId &&
    proof.reportId === receipt.reportId && sha(proof.buildId) && sha(proof.latestSha256) &&
    proof.historySha256 === proof.latestSha256 && proof.browserChecksPassed === true &&
    Number.isFinite(Date.parse(proof.checkedAt));
  const status = !repositoryPublished ? 'failed' : deployed ? 'deployed' :
    ['failure', 'cancelled', 'timed_out'].includes(jobStatus) ? 'deployment-failed' : 'published-unverified';
  return { status, at: new Date(now).toISOString(), published: repositoryPublished,
    repositoryPublished, deployed, reportId: repositoryPublished ? receipt.reportId : null,
    workflowRunId: state.workflowRunId, deploymentWorkflowRunId: workflowRunId,
    deadlineAt: state.deadlineAt, error: status === 'failed' ? '没有与本批次身份及哈希匹配的成功仓库回执' :
      status === 'deployment-failed' ? '仓库报告已提交，但本次公网部署或页面验收失败' :
      status === 'published-unverified' ? '仓库已提交；缺少完整公网验收证据，不能判定更新成功' : null,
    issues: [], deployment: { status: deployed ? 'verified' : status === 'deployment-failed' ? 'failed' : 'unverified',
      workflowRunId, buildId: proof?.buildId || null, checkedAt: deployed ? proof.checkedAt : null,
      jobStatus: jobStatus || 'unknown' } };
}
module.exports = { classify, receiptMatches };
