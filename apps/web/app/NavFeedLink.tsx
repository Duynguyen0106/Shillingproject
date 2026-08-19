"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LIVE_POST_EVENT } from "../lib/liveFeed";

export default function NavFeedLink() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const onFeed = pathname === "/app/feed";

  useEffect(() => {
    if (onFeed) setUnread(0);
  }, [onFeed]);

  useEffect(() => {
    const onPost = () => {
      if (window.location.pathname === "/app/feed") return;
      setUnread((count) => count + 1);
    };
    window.addEventListener(LIVE_POST_EVENT, onPost);
    return () => window.removeEventListener(LIVE_POST_EVENT, onPost);
  }, []);

  return (
    <Link href="/app/feed" className={onFeed ? "nav-active" : undefined}>
      Feed
      {unread > 0 && !onFeed && <span className="live-dot">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
