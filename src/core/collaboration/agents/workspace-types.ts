/**
 * 工作空间权限类型定义
 */

export interface WorkspacePermission {
  read: boolean;
  write: boolean;
  delete: boolean;
  delegate: boolean;
}