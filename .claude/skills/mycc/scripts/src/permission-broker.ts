/**
 * 权限网关
 *
 * 管理 IM 通道（微信/飞书）的工具权限确认。
 * CC 需要使用工具时 → 发确认消息到 IM → 等待用户回复 → resolve Promise。
 *
 * 参考：https://github.com/op7418/Claude-to-IM-skill
 */

// ── 类型 ──────────────────────────────────────────────────────────────────

/** 权限响应动作 */
export type PermAction = "allow" | "allow_session" | "deny";

/** 待处理权限请求（内部） */
interface PendingEntry {
  toolName: string;
  toolUseID: string;
  resolve: (action: PermAction) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
}

// ── 常量 ──────────────────────────────────────────────────────────────────

/** 权限超时：5 分钟未回复自动拒绝 */
const PERM_TIMEOUT_MS = 5 * 60 * 1000;

/** 输入预览最大长度 */
const INPUT_PREVIEW_MAX = 500;

// ── PendingPermissions ───────────────────────────────────────────────────

/**
 * 待处理权限池
 *
 * canUseTool 回调 → waitFor() 阻塞
 * IM 用户回复 → resolve() 释放
 */
export class PendingPermissions {
  private pending = new Map<string, PendingEntry>();

  /** 当前待处理数量 */
  get size(): number {
    return this.pending.size;
  }

  /**
   * 注册一个权限请求并阻塞等待用户回复
   */
  waitFor(toolUseID: string, toolName: string): Promise<PermAction> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(toolUseID);
        resolve("deny");
      }, PERM_TIMEOUT_MS);

      this.pending.set(toolUseID, {
        toolName,
        toolUseID,
        resolve,
        timer,
        createdAt: Date.now(),
      });
    });
  }

  /**
   * 解决一个权限请求
   * @returns true 如果找到并解决了，false 如果没找到
   */
  resolve(toolUseID: string, action: PermAction): boolean {
    const entry = this.pending.get(toolUseID);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(toolUseID);
    entry.resolve(action);
    return true;
  }

  /**
   * 获取唯一待处理请求的 toolUseID（用于数字快捷回复）
   * 只有恰好 1 个 pending 时才返回，否则返回 null
   */
  getSolePendingId(): string | null {
    if (this.pending.size !== 1) return null;
    return this.pending.values().next().value?.toolUseID ?? null;
  }

  /**
   * 拒绝所有 pending（关闭/异常时调用）
   */
  denyAll(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve("deny");
    }
    this.pending.clear();
  }
}

// ── 消息格式化 ───────────────────────────────────────────────────────────

/**
 * 格式化权限请求为纯文本消息（微信/QQ 等不支持按钮的平台）
 */
export function formatPermissionMessage(
  toolName: string,
  input: Record<string, unknown>,
  toolUseID: string,
): string {
  let inputPreview = JSON.stringify(input, null, 2);
  if (inputPreview.length > INPUT_PREVIEW_MAX) {
    inputPreview = inputPreview.substring(0, INPUT_PREVIEW_MAX) + "\n...";
  }

  return [
    `[权限确认]`,
    `工具: ${toolName}`,
    inputPreview,
    ``,
    `回复:`,
    `1 - 允许一次`,
    `2 - 本次会话始终允许`,
    `3 - 拒绝`,
    ``,
    `或完整命令:`,
    `/perm allow ${toolUseID}`,
    `/perm allow_session ${toolUseID}`,
    `/perm deny ${toolUseID}`,
  ].join("\n");
}

// ── 解析用户回复 ─────────────────────────────────────────────────────────

/**
 * 解析用户的权限回复
 *
 * 支持:
 * - 数字快捷: "1" (allow), "2" (allow_session), "3" (deny)
 * - 完整命令: "/perm allow <id>", "/perm allow_session <id>", "/perm deny <id>"
 *
 * @returns 解析结果，null 表示不是权限回复
 */
export function parsePermissionReply(
  text: string,
): { action: PermAction; toolUseID?: string } | null {
  const trimmed = text.trim().normalize("NFKC");

  // 数字快捷回复（无 toolUseID，需要配合 getSolePendingId 使用）
  if (trimmed === "1") return { action: "allow" };
  if (trimmed === "2") return { action: "allow_session" };
  if (trimmed === "3") return { action: "deny" };

  // /perm 命令
  const match = trimmed.match(/^\/perm\s+(allow_session|allow|deny)(?:\s+(\S+))?$/i);
  if (match) {
    return {
      action: match[1].toLowerCase() as PermAction,
      toolUseID: match[2],
    };
  }

  return null;
}
