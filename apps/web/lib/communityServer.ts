import { cookies } from "next/headers";
import { COMMUNITY_ID } from "./config";

export function getRequestCommunityId(): string {
  return cookies().get("shillops.community")?.value || COMMUNITY_ID;
}
