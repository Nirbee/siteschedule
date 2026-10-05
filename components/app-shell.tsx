import { BottomTabBar } from "@/components/nav/bottom-tab-bar";
import { TopNav } from "@/components/nav/top-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-[1280px] px-[18px] pt-6 pb-28 md:px-6 md:pt-10 md:pb-16">
        {children}
      </main>
      <BottomTabBar />
    </>
  );
}
