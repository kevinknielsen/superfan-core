"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Crown, Search } from "lucide-react";

interface MemberManagementProps {
  onStatsUpdate?: () => void;
}

export default function MemberManagement({ onStatsUpdate }: MemberManagementProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Member Management
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8 text-center">
        <Crown className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
        <p className="text-muted-foreground">
          Member management interface will be available in the next update
        </p>
      </CardContent>
    </Card>
  );
}
