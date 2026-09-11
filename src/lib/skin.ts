/**
 * 视觉皮肤（skin）：同一套功能，两种视觉语言。
 *
 * - `rich`    现有版本：卡片、圆角、阴影、渐变、多色紧迫度 —— 信息丰富、视觉活泼
 * - `minimal` 苹果级极简：无阴影、无渐变、发丝级分隔线、留白更大、色彩收敛为
 *             单强调色 + 中性灰 —— 克制、安静、长时间阅读不疲劳
 *
 * 实现方式：`rich` 保持原有 Tailwind 类不变；`minimal` 通过在根节点挂
 * `data-skin="minimal"`，由 `src/index.css` 中的覆盖规则整体改变视觉语言。
 * 这样两套皮肤共用一份 JSX，不会让组件代码被 `skin === x ? a : b` 撕裂。
 */

export type Skin = 'rich' | 'minimal';

const STORAGE_KEY = 'journal-cfp-ddl:skin';

/** 读取持久化的皮肤偏好，默认 rich */
export function loadSkin(): Skin {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'minimal' ? 'minimal' : 'rich';
  } catch {
    // 隐私模式下 localStorage 可能不可读，回退默认皮肤
    return 'rich';
  }
}

/** 持久化皮肤偏好（写入失败不影响使用） */
export function saveSkin(skin: Skin): void {
  try {
    localStorage.setItem(STORAGE_KEY, skin);
  } catch {
    /* 忽略 */
  }
}

/** 供测试与 UI 展示用 */
export const SKIN_LABELS: Record<Skin, { name: string; hint: string }> = {
  rich: { name: '精致', hint: '卡片、阴影、多色紧迫度，信息密度高' },
  minimal: { name: '简约', hint: '无阴影渐变，发丝分隔线，留白更大（苹果风）' },
};
