import { createHash } from "crypto";
import { ActionType, Platform, SignalType } from "@prisma/client";
import { X_COMMUNITY_TASK_PREFIX, xCommunityTaskDetails } from "./xcommunity";

export const PLAY_MAX = 5;
export const PLAY_PREFIX = "play:";

export type PlayId =
  | "reply-narrative"
  | "quote-signal"
  | "x-community"
  | "share-telegram"
  | "discord-boost"
  | "dex-comment"
  | "invite-raider"
  | "daily-pulse"
  | "fud-ratio";

export type PlayKind = "standing" | "triggered";

export type DealtPlay = {
  id: PlayId;
  title: string;
  details: string;
  actionType: ActionType;
  platform: Platform;
  basePoints: number;
  kind: PlayKind;
};

export type DealContext = {
  signalType?: SignalType | null;
  xCommunityId?: string | null;
  dexUrl?: string | null;
  pulse?: boolean;
};

const PLAY_IDS: PlayId[] = [
  "reply-narrative",
  "quote-signal",
  "x-community",
  "share-telegram",
  "discord-boost",
  "dex-comment",
  "invite-raider",
  "daily-pulse",
  "fud-ratio"
];

export function isPlayId(value: string): value is PlayId {
  return PLAY_IDS.includes(value as PlayId);
}

export function playDetails(id: PlayId, extra?: string): string {
  if (id === "x-community" && extra) return xCommunityTaskDetails(extra);
  return `${PLAY_PREFIX}${id}`;
}

export function playIdFromDetails(details?: string | null): PlayId | null {
  if (!details) return null;
  if (details.startsWith(X_COMMUNITY_TASK_PREFIX)) return "x-community";
  if (!details.startsWith(PLAY_PREFIX)) return null;
  const id = details.slice(PLAY_PREFIX.length).split(";")[0];
  return isPlayId(id) ? id : null;
}

export function utcPulseKey(communityId: string, now = new Date()): string {
  return `pulse:${communityId}:${now.toISOString().slice(0, 10)}`;
}

function play(input: DealtPlay): DealtPlay {
  return input;
}

function replyNarrative(): DealtPlay {
  return play({
    id: "reply-narrative",
    title: "Reply the narrative",
    details: playDetails("reply-narrative"),
    actionType: ActionType.REPLY,
    platform: Platform.X,
    basePoints: 10,
    kind: "standing"
  });
}

function shareTelegram(): DealtPlay {
  return play({
    id: "share-telegram",
    title: "Share in Telegram",
    details: playDetails("share-telegram"),
    actionType: ActionType.SHARE,
    platform: Platform.TELEGRAM,
    basePoints: 6,
    kind: "standing"
  });
}

function inviteRaider(): DealtPlay {
  return play({
    id: "invite-raider",
    title: "Invite a raider",
    details: playDetails("invite-raider"),
    actionType: ActionType.INVITE,
    platform: Platform.X,
    basePoints: 8,
    kind: "standing"
  });
}

function xCommunityPlay(xCommunityId: string): DealtPlay {
  return play({
    id: "x-community",
    title: "Post in the linked X Community",
    details: playDetails("x-community", xCommunityId),
    actionType: ActionType.SHARE,
    platform: Platform.X,
    basePoints: 8,
    kind: "standing"
  });
}

function dexComment(): DealtPlay {
  return play({
    id: "dex-comment",
    title: "Comment on the DexScreener pair",
    details: playDetails("dex-comment"),
    actionType: ActionType.SHARE,
    platform: Platform.X,
    basePoints: 6,
    kind: "standing"
  });
}

function discordBoost(): DealtPlay {
  return play({
    id: "discord-boost",
    title: "Boost the Discord raid channel",
    details: playDetails("discord-boost"),
    actionType: ActionType.BOOST,
    platform: Platform.DISCORD,
    basePoints: 4,
    kind: "triggered"
  });
}

function fudRatio(): DealtPlay {
  return play({
    id: "fud-ratio",
    title: "Reply FUD with the mint",
    details: playDetails("fud-ratio"),
    actionType: ActionType.REPLY,
    platform: Platform.X,
    basePoints: 10,
    kind: "triggered"
  });
}

function dailyPulsePlay(): DealtPlay {
  return play({
    id: "daily-pulse",
    title: "Post the daily pulse",
    details: playDetails("daily-pulse"),
    actionType: ActionType.SHARE,
    platform: Platform.X,
    basePoints: 6,
    kind: "standing"
  });
}

function quoteSignal(type: SignalType): DealtPlay {
  const title =
    type === SignalType.KOL_POST
      ? "Quote the KOL post"
      : type === SignalType.MENTION_SPIKE
        ? "Quote the mention wave"
        : "Quote the pump";
  return play({
    id: "quote-signal",
    title,
    details: playDetails("quote-signal"),
    actionType: ActionType.SHARE,
    platform: Platform.X,
    basePoints: 6,
    kind: "triggered"
  });
}

function overlayFor(type: SignalType): DealtPlay {
  return quoteSignal(type);
}

export function dealPlays(ctx: DealContext): DealtPlay[] {
  const dealt: DealtPlay[] = [];
  const add = (next: DealtPlay | null | undefined) => {
    if (!next) return;
    if (dealt.some((play) => play.id === next.id)) return;
    if (dealt.length >= PLAY_MAX) return;
    dealt.push(next);
  };

  if (ctx.pulse) {
    add(dailyPulsePlay());
    add(replyNarrative());
    add(shareTelegram());
    if (ctx.xCommunityId) add(xCommunityPlay(ctx.xCommunityId));
    add(inviteRaider());
    if (ctx.dexUrl) add(dexComment());
    return dealt;
  }

  add(replyNarrative());
  if (ctx.signalType) add(overlayFor(ctx.signalType));
  add(shareTelegram());
  if (ctx.xCommunityId) add(xCommunityPlay(ctx.xCommunityId));
  add(inviteRaider());
  if (ctx.dexUrl) add(dexComment());
  if (ctx.signalType === SignalType.MENTION_SPIKE) add(discordBoost());
  if (ctx.signalType === SignalType.KOL_POST) add(fudRatio());
  return dealt;
}

export function personalTaskOrder<T extends { id: string }>(tasks: T[], wallet: string, missionId: string): T[] {
  return [...tasks].sort((a, b) => {
    const ha = createHash("sha256").update(`${wallet.toLowerCase()}|${missionId}|${a.id}`).digest("hex");
    const hb = createHash("sha256").update(`${wallet.toLowerCase()}|${missionId}|${b.id}`).digest("hex");
    return ha.localeCompare(hb);
  });
}

export function nextUnsubmittedTask<T extends { id: string }>(
  tasks: T[],
  wallet: string,
  missionId: string,
  submittedTaskIds: Iterable<string>
): T | null {
  const done = new Set(submittedTaskIds);
  return personalTaskOrder(tasks, wallet, missionId).find((task) => !done.has(task.id)) ?? null;
}

export type NextPlay = {
  missionId: string;
  missionTitle: string;
  taskId: string;
  taskTitle: string;
  playId: PlayId | null;
  actionType?: string;
  platform?: string;
};

export function serializeNextPlay<T extends { id: string; title: string; details?: string | null; actionType?: string; platform?: string }>(
  task: T,
  mission: { id: string; title: string }
): NextPlay {
  return {
    missionId: mission.id,
    missionTitle: mission.title,
    taskId: task.id,
    taskTitle: task.title,
    playId: playIdFromDetails(task.details),
    actionType: task.actionType,
    platform: task.platform
  };
}
