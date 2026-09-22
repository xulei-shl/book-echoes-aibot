/** 按固定大小把数组切成若干批。wide 分片与精排分批共用这一份（两处都要求「完整覆盖、不重不漏」）。 */
export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
