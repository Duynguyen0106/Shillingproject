export type ScoreInput = {
  basePoints: number;
  isEarly: boolean;
  engagementValue: number;
  highPriority: boolean;
  duplicatePenalty: boolean;
};

export function computeScore(input: ScoreInput): number {
  const earlyBonus = input.isEarly ? input.basePoints * 0.3 : 0;
  const engagementBonus = Math.min(20, Math.floor(input.engagementValue / 10));
  const priorityMultiplier = input.highPriority ? 1.5 : 1;
  const spamPenalty = input.duplicatePenalty ? input.basePoints * 0.4 : 0;
  return Math.max(0, Math.floor((input.basePoints + earlyBonus + engagementBonus) * priorityMultiplier - spamPenalty));
}

export function scoreAttributedClick(input: { highPriority: boolean }): number {
  return input.highPriority ? 2 : 1;
}
