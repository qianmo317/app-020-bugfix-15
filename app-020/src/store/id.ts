import {
  FACILITY_CODES,
  type Building,
  type Facility,
  type FacilityKind,
  type Floor,
} from '../model';

let seq = 0;
export function uid(): string {
  return `id_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function floorLabel(level: number): string {
  return level >= 1 ? `${level}F` : `B${-level}`;
}

/** 楼栋编号清洗：只允许字母数字与连字符，去掉空白与分隔符（编号本身会再拼 '-'） */
export function sanitizeBuildingCode(code: string): string {
  return code.replace(/[\s-]+/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** 编号前缀：楼栋未编号时为 3F-EX-，编号后为 A-3F-EX- */
export function codePrefix(buildingCode: string | undefined, level: number, kind: FacilityKind): string {
  const b = buildingCode ? `${sanitizeBuildingCode(buildingCode)}-` : '';
  return `${b}${floorLabel(level)}-${FACILITY_CODES[kind]}-`;
}

/** 完整设施编号：楼栋(可选)-楼层-类型-两位序号，如 A-3F-EX-01 / 1F-EX-01 */
export function buildFacilityCode(buildingCode: string | undefined, level: number, kind: FacilityKind, seqNo: number): string {
  return `${codePrefix(buildingCode, level, kind)}${String(seqNo).padStart(2, '0')}`;
}

/**
 * 设施编号：楼层前缀 + 类型 + 序号，查重取该层同类型已用的最大序号 +1。
 * 用「最大序号 +1」而不是「数量 +1」：删掉中间一台再添加不会与剩余编号撞号（允许中间断号）。
 * 不同楼层/楼栋前缀天然不同，互不干扰。
 */
export function nextCode(floor: Floor, kind: FacilityKind, buildingCode?: string): string {
  const prefix = codePrefix(buildingCode, floor.level, kind);
  let max = 0;
  for (const f of floor.facilities) {
    if (!f.code.startsWith(prefix)) continue;
    const tail = f.code.slice(prefix.length);
    const n = Number(tail);
    // 非纯数字序号（如 1F-EX-AB）不参与查重
    if (/^\d+$/.test(tail) && Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

/**
 * 解析设施编号的末段：返回 { kind, seqText } 或 null。
 * 编号形如 [楼栋-]楼层-类型-序号，类型段可能是 EX/EXIT/HY/...，故自右向左取。
 */
export function splitFacilityCode(code: string): { kind: FacilityKind; seqText: string } | null {
  const parts = code.split('-');
  if (parts.length < 3) return null;
  const seqText = parts[parts.length - 1];
  const typeToken = parts[parts.length - 2];
  const entry = Object.entries(FACILITY_CODES).find(([, token]) => token === typeToken) as
    | [FacilityKind, string]
    | undefined;
  if (!entry) return null;
  return { kind: entry[0], seqText };
}

/**
 * 按「楼栋 + 层号 + 类型」重建全部设施编号，保证同一楼层内同类型编号唯一。
 * - 楼栋编号变更（含首次设置）时，前缀整体跟随；
 * - 历史数据（无楼层前缀 / 计数式撞号）加载时一次性归一化；
 * - 同层同类型若出现重号，按设施在数组中的顺序补位到最小可用序号。
 * 检查记录与设施的关联用的是稳定 id，编号仅为展示/对账标签，重写不影响关联。
 */
export function normalizeFacilityCodes(
  floors: Record<string, Floor>,
  buildings: Building[],
): string[] {
  const buildingById = new Map(buildings.map((b) => [b.id, b.code ?? '']));
  const changed: string[] = [];
  for (const floor of Object.values(floors)) {
    const buildingCode = buildingById.get(floor.buildingId) ?? '';
    // 按设施当前数组顺序处理：保留可解析的旧序号，冲突/非法时补位
    const usedByKind = new Map<FacilityKind, Set<number>>();
    // 先占住所有「合法且无冲突」的序号
    const parsed = floor.facilities.map((f) => {
      // 类型一律以设施真实 kind 为准：旧数据可能无楼层前缀（如 EXIT-01 仅两段），
      // splitFacilityCode 解析不出时不能把出口错当成灭火器
      const kind = f.kind;
      const seqText = splitFacilityCode(f.code)?.seqText ?? '';
      let seq = /^\d+$/.test(seqText) ? Number(seqText) : 0;
      const used = usedByKind.get(kind) ?? new Set<number>();
      if (seq > 0 && !used.has(seq)) {
        used.add(seq);
      } else {
        seq = 0; // 非法或撞号 → 稍后补位
      }
      usedByKind.set(kind, used);
      return { f, kind, seq };
    });
    for (const item of parsed) {
      if (item.seq === 0) {
        const used = usedByKind.get(item.kind)!;
        let n = 1;
        while (used.has(n)) n++;
        used.add(n);
        item.seq = n;
      }
      const next = buildFacilityCode(buildingCode, floor.level, item.kind, item.seq);
      if (next !== item.f.code) {
        item.f.code = next;
        changed.push(item.f.id);
      }
    }
  }
  return changed;
}

export function facilityBelongs(f: Facility, kind: FacilityKind): boolean {
  return f.kind === kind;
}
