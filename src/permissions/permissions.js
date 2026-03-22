const { stmts } = require('../database/db');

/**
 * Check if a user ID is in the admin list.
 */
function isAdmin(userId) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  return adminIds.includes(userId);
}

/**
 * Check if a user has access to a specific Antigravity instance.
 * Admins always have access.
 */
function hasInstanceAccess(userId, instanceName) {
  if (isAdmin(userId)) return true;
  return !!stmts.hasAccess.get(userId, instanceName);
}

/**
 * Check if a user is allowed to use a specific command.
 * Admins can always use all commands.
 * Users must be explicitly granted command access.
 */
function hasCommandAccess(userId, commandName) {
  if (isAdmin(userId)) return true;
  // Some commands are always accessible
  const alwaysAllowed = ['help'];
  if (alwaysAllowed.includes(commandName)) return true;

  const row = stmts.getCommandAccess.get(userId, commandName);
  return row ? !!row.allowed : false;
}

/**
 * Grant a user access to an instance.
 */
function grantInstanceAccess(userId, instanceName, grantedBy) {
  stmts.grantAccess.run(userId, instanceName, grantedBy);
}

/**
 * Revoke a user's access to an instance.
 */
function revokeInstanceAccess(userId, instanceName) {
  stmts.revokeAccess.run(userId, instanceName);
}

/**
 * Revoke all instance access for a user.
 */
function revokeAllInstanceAccess(userId) {
  stmts.revokeAllAccess.run(userId);
}

/**
 * Set whether a user can use a specific command.
 */
function setCommandAccess(userId, commandName, allowed, setBy) {
  stmts.setCommandAccess.run(userId, commandName, allowed ? 1 : 0, setBy);
}

/**
 * Get the effective model for a user.
 * Priority: locked model > user's default > null
 */
function getEffectiveModel(userId) {
  // Check for admin-locked model first
  const locked = stmts.getLockedModel.get(userId);
  if (locked) return { model: locked.model, source: 'locked' };

  // Then check user's default
  const setting = stmts.getDefaultModel.get(userId);
  if (setting && setting.default_model) {
    return { model: setting.default_model, source: 'user' };
  }

  return { model: null, source: 'none' };
}

/**
 * Check if a model is blocked for a user.
 */
function isModelBlocked(userId, model) {
  if (isAdmin(userId)) return false;
  return !!stmts.isModelBlocked.get(userId, model);
}

module.exports = {
  isAdmin,
  hasInstanceAccess,
  hasCommandAccess,
  grantInstanceAccess,
  revokeInstanceAccess,
  revokeAllInstanceAccess,
  setCommandAccess,
  getEffectiveModel,
  isModelBlocked,
};
