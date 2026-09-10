/**
 * Journal类型定义
 * 包含期刊元数据和CFP信息
 */

export interface JournalRank {
  /** 影响因子 */
  impact_factor?: number;
  /** SCImago分区: Q1-Q4 */
  sjr?: string;
  /** JCR分区: Q1-Q4 */
  jcr?: string;
  /** 中科院分区: 1区-4区 */
  cas?: string;
  /** 新锐分区: A/B/C */
  xinrui?: string;
  /** CCF分区: A/B/C */
  ccf?: string;
  /** CiteScore数值 */
  citescore?: number;
}

/** CFP类型 */
export type CFPType = 'cfp' | 'collection' | 'special_issue' | 'research_topic';

/** CFP状态 - computed from deadline */
export type CFPStatus = 'open' | 'upcoming' | 'closing' | 'expired' | 'unknown';

/** 参与期刊信息 (Nature Collection 跨期刊) */
export interface ParticipatingJournal {
  name: string;
  journal_path: string;
  submit_link: string;
}

/** 单个CFP条目 */
export interface CFP {
  /** CFP标题 */
  title: string;
  /** CFP类型 */
  type?: CFPType;
  /** 截止日期 ISO 8601格式 (manuscript) */
  deadline: string;
  /** 摘要截止日期 ISO 8601 (MDPI Topics 可选) */
  abstract_deadline?: string;
  /** CFP链接 */
  link: string;
  /** CFP描述 */
  description?: string;
  /** 投稿链接 (当前期刊) */
  submit_link?: string;
  /** 主题标签 */
  tags?: string[];
  /** 参与期刊列表 (跨期刊Collection) */
  participating_journals?: ParticipatingJournal[];
  /** 首次发现时间 ISO 8601 */
  first_seen?: string;
  /** 计算状态 (由前端计算) */
  status?: CFPStatus;
  /** 剩余天数 (由前端计算，正数=有效/负数=过期) */
  days_remaining?: number;
  /** 手动锁定标志 (防止爬虫覆盖) */
  manual_lock?: boolean;
  /** 已验证标志 */
  verified?: boolean;
}

/** 期刊完整信息 */
export interface Journal {
  /** 期刊名称 */
  title: string;
  /** 期刊缩写 (如 "Nat. Commun.") */
  abbreviation?: string;
  /** 出版社 */
  publisher: string;
  /** 学科类别 */
  category: string;
  /** ISSN号 */
  issn?: string;
  /** H指数 */
  hindex?: number;
  /** 排名信息 */
  rank?: JournalRank;
  /** CFP列表 */
  cfps: CFP[];
  /** 期刊官网 */
  website?: string;
  /** 期刊描述 */
  description?: string;
  /** 投稿链接 */
  submissionUrl?: string;
}

/** 排序字段 */
export type SortField = 'deadline' | 'title' | 'impact_factor' | 'publisher';

/** 视图模式 */
export type ViewMode = 'card' | 'table';

/** 主题模式 */
export type ThemeMode = 'light' | 'dark';

/** 数据集元数据 */
export interface DatasetMetadata {
  /** 数据生成时间 */
  generated_at: string;
  /** 数据来源 */
  source: string;
  /** 总期刊数 */
  total_journals: number;
  /** 开放CFP数 */
  total_open_cfps: number;
}

/** 筛选器状态 */
export interface FilterState {
  search: string;
  publisher: string;
  category: string;
  status: CFPStatus | '';
}

/** 排序配置 */
export interface SortConfig {
  field: SortField;
  direction: 'asc' | 'desc';
}

/* ==========================================================================
 * 分片数据契约 (public/data/index.json + public/data/shards/YYYY-MM.json)
 * --------------------------------------------------------------------------
 * 数据层按「截止月份」切片产出，前端按需加载，避免一次性拉取全量数据。
 * 分片内字段名使用缩写以压缩体积，含义见 CFPRecord 注释。
 * ========================================================================== */

/** 期刊指标（SCImago 口径，按 ISSN join 自 journal_meta.json，免费数据源） */
export interface JournalMetric {
  /** SJR 最佳分区 Q1-Q4 */
  q?: string;
  /** SJR 指数 */
  s?: number;
  /** H 指数 */
  h?: number;
  /** 开放获取（OpenAlex，1=是） */
  oa?: 1;
}

/**
 * 分片文件中的单条 CFP 记录。
 * 字段名经缩写（title→t、journal→j …），请勿在 UI 层直接依赖缩写语义。
 */
export interface CFPRecord {
  /** 唯一 ID（由数据层生成） */
  id: string;
  /** 标题 */
  t: string;
  /** 期刊名 */
  j: string;
  /** 出版社 */
  p: string;
  /** 截止日期 YYYY-MM-DD */
  d: string;
  /** 截止时间戳 ISO 8601（含时区） */
  dt: string;
  /** 原文链接 */
  u: string;
  /** CFP 类型 */
  ty: CFPType;
  /** 学科大类 */
  c: string;
  /** 摘要截止日期 YYYY-MM-DD，可能为空字符串 */
  ad: string;
  /** 标签 */
  g: string[];
  /** 描述摘要，可能为空字符串 */
  x: string;
  /** 参与期刊数量 */
  jn: number;
  /** 参与期刊名称列表（跨期刊 Collection，可能缺省） */
  js?: string[];
  /** 滚动征稿标记（无固定截止日期，长期有效） */
  rolling?: boolean;
  /** 期刊 ISSN（8 位，用于 join journal_meta.json 展示指标，可能缺省） */
  is?: string;
}

/**  facet 计数项（出版社 / 学科 / 类型共用） */
export interface FacetCount {
  name: string;
  count: number;
}

/** 月份分片元信息 */
export interface MonthShardMeta {
  /** 月份键，形如 2026-09 */
  name: string;
  /** 相对 data 目录的分片路径，形如 shards/2026-09.json */
  file: string;
  /** 该分片包含的 CFP 条数 */
  count: number;
}

/** 索引文件 index.json 的完整结构 */
export interface CfpIndex {
  /** 数据生成时间 ISO 8601 */
  generated_at: string;
  /** 数据窗口（月） */
  window_months: number;
  /** 数据下界时间 ISO 8601 */
  cutoff: string;
  /** CFP 总条数 */
  total: number;
  /** 滚动征稿条目数（无截止日期、单独分片） */
  rolling_count?: number;
  /** 出版社分布 */
  publishers: FacetCount[];
  /** 学科分布 */
  categories: FacetCount[];
  /** 类型分布 */
  types: FacetCount[];
  /** 月份分片列表（按月份升序） */
  months: MonthShardMeta[];
  /**
   * 维度 × 月份计数矩阵（可选，由数据层生成；旧 index.json 无此字段时前端降级为原行为）。
   * 结构：{ publisher: { "ACS": { "2026-08": 4 } }, category: {...}, type: {...} }。
   * 用于「筛选感知的月份选择」——根据激活的出版社 / 学科 / 类型，只加载可能含匹配结果的月份分片。
   */
  facet_months?: Record<string, Record<string, Record<string, number>>>;
}

/** 列表排序字段 */
export type CfpSortField = 'deadline' | 'journal' | 'publisher';

/** 排序方向 */
export type SortDirection = 'asc' | 'desc';

/** 时间范围筛选 */
export type TimeRange = 'all' | 'soon' | 'month' | 'quarter';

/** 前端完整筛选状态（可序列化进 URL query string） */
export interface CfpFilterState {
  /** 搜索关键词（匹配标题 / 期刊 / 标签 / 出版社 / 学科） */
  search: string;
  /** 选中的出版社（多选，空数组表示不限） */
  publishers: string[];
  /** 选中的学科大类（多选） */
  categories: string[];
  /** 选中的 CFP 类型（多选） */
  types: string[];
  /** 选中的 SJR 分区（多选，空数组表示不限；依赖 journal_meta.json） */
  quartiles: string[];
  /** 时间范围 */
  range: TimeRange;
  /** 排序字段 */
  sort: CfpSortField;
  /** 排序方向 */
  dir: SortDirection;
}

/** 数据加载阶段 */
export type LoadPhase = 'idle' | 'loading-index' | 'loading-shards' | 'ready' | 'error';

/** 顶部统计概览 */
export interface DatasetStats {
  /** 已加载到内存的条数 */
  loaded: number;
  /** 可浏览（当月及未来月份）总条数 */
  loadable: number;
  /** 全库总条数（index.total） */
  total: number;
  /** 7 天内截止 */
  expiringIn7: number;
  /** 30 天内截止 */
  expiringIn30: number;
  /** 已过期 */
  expired: number;
  /** 已加载数据覆盖的期刊数 */
  journals: number;
}