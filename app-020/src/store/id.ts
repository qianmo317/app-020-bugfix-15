import { FACILITY_CODES, type Facility, type FacilityKind, type Floor } from '../model';

let seq = 0;
export function uid(): string {
  return `id_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function floorLabel(level: number): string {
  return level >= 1 ? `${level}F` : `B${-level}`;
}

/** 楼栋码：按建筑在列表中的顺序分配稳定字母（A、B、…、Z、AA…） */
export function buildingCode(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * 设施编号：楼栋-楼层-类型-序号（如 A-3F-EX-01、B-B1-HY-02）。
 * 同楼栋、同楼层、同类型内唯一；换楼栋/楼层后前缀随之改变。
 * 序号取该层该类型已占用的最大数字序号 +1（允许中间断号，删除后不复用小号，
 * 因而删掉中间一台再加不会与剩余设施撞号）；非数字尾号不参与查重。
 */
export function nextCode(floor: Floor, kind: FacilityKind, bcode?: string): string {
  return formatCode(bcode ?? '', floor.level, kind, nextSeq(floor, kind, bcode));
}

/** 解析「同层同类型」已占用的数字序号，返回新序号（max + 1，空层为 1） */
export function nextSeq(floor: Floor, kind: FacilityKind, bcode?: string): number {
  const re = codeSeqRe(floor.level, kind, bcode);
  let max = 0;
  for (const f of floor.facilities) {
    const m = f.code.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

/** 组装完整编号；bcode 为空时退化为不带楼栋前缀（仅供无楼栋上下文的工具使用） */
export function formatCode(bcode: string, level: number, kind: FacilityKind, seqNo: number): string {
  const head = bcode ? `${bcode}-` : '';
  return `${head}${floorLabel(level)}-${FACILITY_CODES[kind]}-${String(seqNo).padStart(2, '0')}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 匹配本层本类型编号尾部「楼层-类型码-序号」的正则：
 * 指定 bcode 时严格匹配该楼栋前缀（A-3F-EX-01）；
 * 不指定时同时接受带楼栋前缀与旧格式（3F-EX-01），
 * 且 EX 不会误匹配 EXIT（要求序号紧跟在类型码之后）。
 */
function codeSeqRe(level: number, kind: FacilityKind, bcode?: string): RegExp {
  const fl = escapeRe(floorLabel(level));
  const head = bcode ? `^${escapeRe(bcode)}-` : '(?:^|-)';
  return new RegExp(`${head}${fl}-${FACILITY_CODES[kind]}-(\\d+)$`);
}

/**
 * 楼层整体重新编号：按类型分组、按当前数组顺序从 01 连续编号。
 * 用于楼栋码或楼层归属变化（前缀必须整体更换）及历史脏数据迁移。
 */
export function renumberFloor(floor: Floor, bcode: string): Floor {
  const counters = new Map<FacilityKind, number>();
  const facilities = floor.facilities.map((f) => {
    const n = (counters.get(f.kind) ?? 0) + 1;
    counters.set(f.kind, n);
    return { ...f, code: formatCode(bcode, floor.level, f.kind, n) };
  });
  return { ...floor, facilities };
}

/**
 * 编号健康检查：全部设施编号都符合「楼栋码-层号-类型码-序号」且同层同类无重号。
 * 不满足（旧格式、换楼未换前缀、删除重建撞号等）时应整层重新编号迁移。
 */
export function codesHealthy(floor: Floor, bcode: string): boolean {
  const seen = new Set<string>();
  for (const f of floor.facilities) {
    const expect = formatCode(bcode, floor.level, f.kind, 1).replace(/-01$/, '');
    if (!f.code.startsWith(`${expect}-`)) return false;
    if (!/^\d+$/.test(f.code.slice(expect.length + 1))) return false;
    if (seen.has(f.code)) return false;
    seen.add(f.code);
  }
  return true;
}

export function facilityBelongs(f: Facility, kind: FacilityKind): boolean {
  return f.kind === kind;
}
