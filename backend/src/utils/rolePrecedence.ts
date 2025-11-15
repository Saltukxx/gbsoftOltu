import { UserRole } from '@prisma/client';

/**
 * Role hierarchy precedence mapping
 * Higher number = higher precedence
 */
const ROLE_PRECEDENCE: Record<UserRole, number> = {
  PRESIDENT: 5,
  ADMIN: 4,
  SUPERVISOR: 3,
  OPERATOR: 2,
  MESSENGER: 1,
};

/**
 * Get the precedence rank of a role
 * @param role - The user role
 * @returns The precedence rank (higher = more authority)
 */
export const getRoleRank = (role: UserRole): number => {
  return ROLE_PRECEDENCE[role] || 0;
};

/**
 * Check if a role has higher precedence than another role
 * @param role1 - First role to compare
 * @param role2 - Second role to compare
 * @returns True if role1 has strictly higher precedence than role2
 */
export const hasHigherPrecedence = (role1: UserRole, role2: UserRole): boolean => {
  return getRoleRank(role1) > getRoleRank(role2);
};

/**
 * Check if a role has equal or higher precedence than another role
 * @param role1 - First role to compare
 * @param role2 - Second role to compare
 * @returns True if role1 has equal or higher precedence than role2
 */
export const hasEqualOrHigherPrecedence = (role1: UserRole, role2: UserRole): boolean => {
  return getRoleRank(role1) >= getRoleRank(role2);
};

/**
 * Check if a role can assign tasks (PRESIDENT, ADMIN, SUPERVISOR)
 * @param role - The user role
 * @returns True if the role can assign tasks
 */
export const canAssignTasks = (role: UserRole): boolean => {
  return role === UserRole.PRESIDENT || 
         role === UserRole.ADMIN || 
         role === UserRole.SUPERVISOR;
};

/**
 * Check if a role is President
 * @param role - The user role
 * @returns True if the role is PRESIDENT
 */
export const isPresident = (role: UserRole): boolean => {
  return role === UserRole.PRESIDENT;
};

