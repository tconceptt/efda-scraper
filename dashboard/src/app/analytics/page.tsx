import { Suspense } from "react";
import { Header } from "@/components/layout/header";
import { AnalyticsClient } from "@/components/analytics/analytics-client";

export default function AnalyticsPage() {
  return (
    <>
      <Header title="Analytics" />
      <Suspense
        fallback={
          <div className="flex h-[400px] items-center justify-center text-muted-foreground">
            Loading analytics...
          </div>
        }
      >
        <AnalyticsClient />
      </Suspense>
    </>
  );
}
