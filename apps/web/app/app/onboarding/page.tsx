"use client";

import OnboardingWizard from "../../OnboardingWizard";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  return (
    <main className="container">
      <div className="kicker">Welcome</div>
      <h1>Get started with Shill Ops</h1>
      <OnboardingWizard onDone={() => router.push("/app/feed")} />
    </main>
  );
}
