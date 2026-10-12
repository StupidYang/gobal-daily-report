'use strict';

// Only deliberate validation results use this type. Never wrap arbitrary runtime errors.
function normalizeIssue(issue) {
  if (typeof issue === 'string' && issue.trim()) return {path:'editorial', code:'invalid', message:issue};
  if (!issue || typeof issue !== 'object' || Array.isArray(issue) ||
      typeof issue.path !== 'string' || !issue.path.trim() ||
      typeof issue.code !== 'string' || !issue.code.trim() ||
      typeof issue.message !== 'string' || !issue.message.trim()) {
    throw new TypeError('Validation issues must be nonempty strings or {path, code, message} objects');
  }
  return {...issue};
}
function formatValidationIssue(issue) {
  const value=normalizeIssue(issue);
  return value.path+': '+value.message+' ['+value.code+']';
}
class EditorialValidationError extends Error {
  constructor(issues, {stage='editorial-input'}={}) {
    if (!Array.isArray(issues) || !issues.length) throw new TypeError('EditorialValidationError requires validation issues');
    const normalized=issues.map(normalizeIssue);
    super(normalized.map(formatValidationIssue).join('\n'));
    this.name='EditorialValidationError';
    this.code='EDITORIAL_VALIDATION_FAILED';
    this.stage=stage;
    this.issues=normalized;
  }
}
const isEditorialValidationError=error=>error instanceof EditorialValidationError;
module.exports={EditorialValidationError,isEditorialValidationError,formatValidationIssue};
