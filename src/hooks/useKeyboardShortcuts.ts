import { useEffect, useRef, useState } from 'react';

/**
 * 全局键盘快捷键（P2-3）。
 *
 * | 键位        | 行为                                   |
 * |------------|----------------------------------------|
 * | `/`        | 聚焦搜索框                             |
 * | `f`        | 切换「只看收藏」                       |
 * | `g g`      | 回到页首（vim 风格，500ms 内连按两次）  |
 * | `←` / `→`  | 上一页 / 下一页                        |
 * | `v`        | 切换紧凑行 / 卡片视图                  |
 * | `?`        | 显示 / 隐藏快捷键帮助                  |
 * | `Esc`      | 关闭帮助，或失焦搜索框                 |
 *
 * 在输入框 / 文本域 / 可编辑区域中打字时，除 `Esc` 外全部快捷键自动失效，
 * 避免「打字的字母被当成命令」这种最常见的误伤。
 */

export interface ShortcutHandlers {
  onFocusSearch: () => void;
  onToggleFavorites: () => void;
  onScrollTop: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onToggleView: () => void;
}

/** 判断当前焦点是否处在「正在输入」的控件里 */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  );
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): { helpOpen: boolean; setHelpOpen: (v: boolean) => void } {
  const [helpOpen, setHelpOpen] = useState(false);
  // 用 ref 持有最新 handlers，避免每次渲染都重挂监听
  const ref = useRef(handlers);
  ref.current = handlers;

  // 记录上一次按 g 的时间，用于识别 `g g` 连击
  const lastG = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 组合键（Ctrl / Cmd / Alt）一律不拦截，交给浏览器
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (helpOpen) {
          setHelpOpen(false);
        } else if (isTypingTarget(e.target) && e.target instanceof HTMLElement) {
          e.target.blur();
        }
        return;
      }

      // 帮助面板打开时，其它快捷键先让位
      if (helpOpen) return;

      if (isTypingTarget(e.target)) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          ref.current.onFocusSearch();
          break;
        case 'f':
          e.preventDefault();
          ref.current.onToggleFavorites();
          break;
        case 'g': {
          const now = Date.now();
          if (now - lastG.current < 500) {
            // 连按两次 g → 回到页首
            e.preventDefault();
            ref.current.onScrollTop();
            lastG.current = 0;
          } else {
            lastG.current = now;
          }
          break;
        }
        case 'ArrowLeft':
          e.preventDefault();
          ref.current.onPrevPage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          ref.current.onNextPage();
          break;
        case 'v':
          e.preventDefault();
          ref.current.onToggleView();
          break;
        case '?':
          e.preventDefault();
          setHelpOpen(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  return { helpOpen, setHelpOpen };
}

/** 快捷键帮助面板里展示的条目 */
export const SHORTCUT_HELP: { keys: string; desc: string }[] = [
  { keys: '/', desc: '聚焦搜索框' },
  { keys: 'f', desc: '只看收藏' },
  { keys: 'g g', desc: '回到页首' },
  { keys: '← / →', desc: '上一页 / 下一页' },
  { keys: 'v', desc: '切换视图（紧凑 / 卡片 / 日历）' },
  { keys: '?', desc: '显示本帮助' },
  { keys: 'Esc', desc: '关闭帮助 / 退出输入框' },
];
