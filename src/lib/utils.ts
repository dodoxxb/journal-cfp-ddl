import { CFPStatus, CFPType } from './types';

/**
 * 计算倒计时文本
 * 处理ISO 8601格式的日期，包括带时区和不带时区的情况
 */
export function getCountdown(deadline: string): { text: string; isExpired: boolean; isClosing: boolean; days: number } {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  
  if (isNaN(deadlineDate.getTime())) {
    return { text: 'Invalid', isExpired: true, isClosing: false, days: 0 };
  }

  const diff = deadlineDate.getTime() - now.getTime();

  if (diff <= 0) {
    return { text: 'Expired', isExpired: true, isClosing: false, days: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  const isClosing = days <= 7;

  if (days > 30) {
    return { text: `${days}d`, isExpired: false, isClosing, days };
  }
  if (days > 0) {
    return { text: `${days}d ${hours}h`, isExpired: false, isClosing, days };
  }
  if (hours > 0) {
    return { text: `${hours}h ${minutes}m`, isExpired: false, isClosing: true, days };
  }
  return { text: `${minutes}m`, isExpired: false, isClosing: true, days };
}

/**
 * 格式化日期
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * 格式化日期（中文）
 */
export function formatDateCN(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * 获取出版社颜色方案
 */
export function getPublisherStyle(publisher: string): { bg: string; text: string; border: string; dot: string } {
  const styles: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    'Springer Nature': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
    'Springer': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
    'Nature Portfolio': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    'Elsevier': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
    'MDPI': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
    'IEEE': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
    'ACM': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
    'Wiley': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500' },
    'Frontiers': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-500' },
    'Cell Press': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  };
  return styles[publisher] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', dot: 'bg-gray-500' };
}

/**
 * 获取倒计时状态颜色
 */
export function getCountdownStyle(status?: CFPStatus, daysRemaining?: number | null): { bg: string; text: string; ring: string } {
  if (status === 'expired' || (daysRemaining !== null && daysRemaining !== undefined && daysRemaining <= 0)) {
    return { bg: 'bg-gray-100', text: 'text-gray-500', ring: 'ring-gray-300' };
  }
  if (status === 'closing' || (daysRemaining !== null && daysRemaining !== undefined && daysRemaining <= 7)) {
    return { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-300' };
  }
  if (status === 'upcoming' || (daysRemaining !== null && daysRemaining !== undefined && daysRemaining <= 30)) {
    return { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-300' };
  }
  return { bg: 'bg-green-50', text: 'text-green-600', ring: 'ring-green-300' };
}

/**
 * 获取CFP类型标签
 */
export function getCFPTypeLabel(type?: CFPType): { label: string; style: string } {
  const labels: Record<string, { label: string; style: string }> = {
    'cfp': { label: 'CFP', style: 'bg-indigo-100 text-indigo-700' },
    'collection': { label: 'Collection', style: 'bg-sky-100 text-sky-700' },
    'special_issue': { label: 'Special Issue', style: 'bg-violet-100 text-violet-700' },
    'research_topic': { label: 'Research Topic', style: 'bg-emerald-100 text-emerald-700' },
  };
  return labels[type || 'cfp'] || { label: 'CFP', style: 'bg-gray-100 text-gray-700' };
}

/**
 * 获取验证状态徽章
 */
export function getVerifiedBadge(verified?: boolean): { label: string; style: string } {
  if (verified) {
    return { label: '✓ Verified', style: 'bg-green-100 text-green-700' };
  }
  return { label: 'Auto', style: 'bg-gray-100 text-gray-500' };
}

/**
 * 获取分区等级颜色
 */
export function getRankColor(rankType: string, value: string | number | undefined): { bg: string; text: string } {
  if (value === undefined || value === null) return { bg: '', text: '' };
  
  const strVal = String(value);
  
  switch (rankType) {
    case 'impact_factor':
    case 'citescore':
      return { bg: 'bg-yellow-100', text: 'text-yellow-800' };
    case 'sjr':
      if (strVal === 'Q1') return { bg: 'bg-green-100', text: 'text-green-800' };
      if (strVal === 'Q2') return { bg: 'bg-blue-100', text: 'text-blue-800' };
      if (strVal === 'Q3') return { bg: 'bg-yellow-100', text: 'text-yellow-800' };
      return { bg: 'bg-gray-100', text: 'text-gray-800' };
    case 'jcr':
      if (strVal === 'Q1') return { bg: 'bg-green-100', text: 'text-green-800' };
      if (strVal === 'Q2') return { bg: 'bg-blue-100', text: 'text-blue-800' };
      return { bg: 'bg-yellow-100', text: 'text-yellow-800' };
    case 'ccf':
      if (strVal === 'A') return { bg: 'bg-red-100', text: 'text-red-800' };
      if (strVal === 'B') return { bg: 'bg-orange-100', text: 'text-orange-800' };
      return { bg: 'bg-yellow-100', text: 'text-yellow-800' };
    case 'cas':
      if (strVal.includes('1')) return { bg: 'bg-red-100', text: 'text-red-800' };
      if (strVal.includes('2')) return { bg: 'bg-orange-100', text: 'text-orange-800' };
      return { bg: 'bg-yellow-100', text: 'text-yellow-800' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-800' };
  }
}

/**
 * 获取排名徽标列表
 */
export function getRankBadges(rank?: Record<string, string | number | undefined>): Array<{ key: string; label: string; value: string; bg: string; text: string }> {
  if (!rank) return [];
  
  const badges = [];
  const mapping: Record<string, string> = {
    'impact_factor': 'IF',
    'citescore': 'CiteScore',
    'sjr': 'SJR',
    'jcr': 'JCR',
    'ccf': 'CCF',
    'cas': 'CAS',
    'xinrui': '新锐',
  };
  
  for (const [key, label] of Object.entries(mapping)) {
    const value = rank[key];
    if (value !== undefined && value !== null) {
      const colors = getRankColor(key, value);
      badges.push({
        key,
        label,
        value: String(value),
        ...colors,
      });
    }
  }
  
  return badges;
}
