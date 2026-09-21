/** 面向用户的失败信息；provider 诊断只进 logger，绝不回传前端。 */
export class JevError extends Error {
  readonly status: number;
  readonly userMessage: string;
  readonly providerMessage?: string;

  constructor(status: number, userMessage: string, options: { providerMessage?: string } = {}) {
    super(`JevError(${status}): ${userMessage}`);
    this.name = 'JevError';
    this.status = status;
    this.userMessage = userMessage;
    this.providerMessage = options.providerMessage;
  }
}

/** 畸形答案：不放行任何不符合 question 规格的响应（§5.2）。 */
export class JevProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JevProtocolError';
  }
}

/** 未配置 TYPESAFE_API_KEY。 */
export class JevDisabledError extends Error {
  constructor(message = 'TYPESAFE_API_KEY 未配置，语义检索不可用') {
    super(message);
    this.name = 'JevDisabledError';
  }
}

/** 把任意异常归一为可读文案，用于降级提示与日志。 */
export function jevFailureMessage(error: unknown): string {
  if (error instanceof JevError) return error.userMessage;
  if (error instanceof JevProtocolError) return '语义检索返回了无法校验的结果，已降级为召回排序';
  if (error instanceof JevDisabledError) return error.message;
  return '语义检索服务暂时不可用';
}
