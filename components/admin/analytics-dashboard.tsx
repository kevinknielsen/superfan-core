"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp } from "lucide-react";

interface AnalyticsDashboardProps {
  stats: {
    totalClubs: number;
    totalMembers: number;
    totalTapIns: number;
    totalUnlocks: number;
  };
}

export default function AnalyticsDashboard({ stats }: AnalyticsDashboardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Analytics Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8 text-center">
        <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
        <p className="text-muted-foreground">
          Advanced analytics and reporting features will be available soon
        </p>
        <div className="mt-4 text-sm text-muted-foreground">
          Current stats: {stats.totalClubs} clubs, {stats.totalMembers} members, {stats.totalTapIns} tap-ins
        </div>
      </CardContent>
    </Card>
  );
}
