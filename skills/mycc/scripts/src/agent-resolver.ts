import { readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * 解析 agentId 对应的目录路径
 * @returns 目录路径，不存在则返回 null
 */
export function resolveAgentDir(agentId: string, agentsDir: string): string | null {
  const dir = join(agentsDir, agentId);
  try {
    if (statSync(dir).isDirectory()) return dir;
  } catch {}
  return null;
}

/**
 * 列出 agentsDir 下所有 agent（子目录名）
 */
export function listAgents(agentsDir: string): string[] {
  try {
    return readdirSync(agentsDir).filter((name) => {
      try {
        return statSync(join(agentsDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
