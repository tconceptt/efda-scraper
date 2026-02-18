"use client";

import { Card, CardContent } from "@/components/ui/card";
import { REPORT_TYPES, type ReportType } from "@/app/analytics/report-config";

interface ReportSelectorProps {
  onSelect: (report: ReportType) => void;
}

export function ReportSelector({ onSelect }: ReportSelectorProps) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {(Object.entries(REPORT_TYPES) as [ReportType, (typeof REPORT_TYPES)[ReportType]][]).map(
        ([slug, config]) => {
          const Icon = config.icon;
          return (
            <Card
              key={slug}
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => onSelect(slug)}
            >
              <CardContent className="flex items-start gap-4 p-5">
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-sm">{config.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {config.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        }
      )}
    </div>
  );
}
