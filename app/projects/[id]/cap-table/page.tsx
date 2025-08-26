"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { usePrivy } from "@/lib/auth-context";

import { ChartContainer } from "@/components/ui/chart";
import * as RechartsPrimitive from "recharts";
import { Loader2 } from "lucide-react";
import { useFinancing } from "@/hooks/use-financing";
import { useProject } from "@/hooks/use-projects";
import { useTeamMembers } from "@/hooks/use-team-members";

export default function CapTablePage() {
  const { user } = usePrivy();
  const params = useParams();

  const projectId = params.id as string;

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: teamMembers = [] } = useTeamMembers(projectId);
  const { data: fundingData, isLoading: fundingLoading } = useFinancing(
    project?.splits_contract_address
  );

  if (projectLoading) {
    return (
      <main className="max-w-5xl mx-auto py-6 sm:py-10 px-4">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </main>
    );
  }

  if (!project) {
    return notFound();
  }

  // Check if user has access (creator, team member, or admin)
  const isCreator = user?.id === project.creator_id;
  const isAdmin = user?.id === "did:privy:cmbb5x9kw007hjy0ml3sfomp2";
  const isTeamMember = teamMembers.some(
    (member) => member.wallet_address === user?.wallet?.address
  );

  if (!isCreator && !isAdmin && !isTeamMember) {
    return (
      <main className="max-w-5xl mx-auto py-6 sm:py-10 px-4">
        <div className="text-center py-20">
          <h1 className="text-xl sm:text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            You don't have permission to view this project's cap table.
          </p>
        </div>
      </main>
    );
  }

  // Prepare chart data based on actual team members
  const totalTeamShares = teamMembers.reduce(
    (sum, member) => sum + member.revenue_share_pct!,
    0
  );

  // Create sound recording chart data (team member splits for recording rights)
  const recordingMembers = teamMembers.filter(
    (member) =>
      member.copyright_type === "sound_recording" ||
      member.copyright_type === "both"
  );

  const soundRecordingData = recordingMembers
    .filter(
      (member) => (member.recording_percentage || member.revenue_share_pct!) > 0
    )
    .map((member, index) => {
      const colors = [
        "#4285F4",
        "#34A853",
        "#FBBC05",
        "#EA4335",
        "#8AB4F8",
        "#4ECDC4",
        "#FF6B6B",
        "#A239CA",
      ];
      return {
        name: member.name || member.role,
        value: member.recording_percentage || member.revenue_share_pct!,
        fill: colors[index % colors.length],
        role: member.role,
        walletAddress: member.wallet_address,
        dealType: member.deal_type,
        producerPoints: member.producer_points,
        flatFee: member.flat_fee,
      };
    });

  // Create composition chart data based on team members with composition rights
  const compositionMembers = teamMembers.filter(
    (member) =>
      member.copyright_type === "composition" ||
      member.copyright_type === "both"
  );

  const compositionData =
    compositionMembers.length > 0
      ? compositionMembers.map((member, index) => {
          const colors = [
            "#4285F4",
            "#34A853",
            "#FBBC05",
            "#EA4335",
            "#8AB4F8",
            "#4ECDC4",
            "#FF6B6B",
            "#A239CA",
          ];
          return {
            name: member.name || member.role,
            value: member.composition_percentage || member.revenue_share_pct,
            fill: colors[index % colors.length],
            role: member.role,
            pro: member.pro_affiliation,
            publisher: member.publisher,
          };
        })
      : [
          {
            name: "No Composition Rights",
            value: 100,
            fill: "#E0E0E0",
            role: "N/A",
            pro: undefined,
            publisher: undefined,
          },
        ];

  // Create funding chart data if funding exists
  const targetRaise = project.financing?.target_raise || 0;
  const fundingProgress = fundingData?.totalUSD || 0;
  const remainingFunding = Math.max(0, targetRaise - fundingProgress);

  const fundingChartData =
    targetRaise > 0
      ? [
          {
            name: "Raised",
            value: fundingProgress,
            fill: "#34A853",
          },
          {
            name: "Remaining",
            value: remainingFunding,
            fill: "#E0E0E0",
          },
        ].filter((item) => item.value > 0)
      : [];

  // Calculate total shares (including platform fee if applicable)
  const platformFeePercent = 50; // Assuming 50% platform allocation as seen in splits creation
  const totalShares = 1000000; // 1M shares as seen in splits creation
  const teamSharesTotal = (totalShares * (100 - platformFeePercent)) / 100;

  return (
    <main className="max-w-5xl mx-auto py-4 sm:py-6 lg:py-10 px-3 sm:px-4">
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2">
        {project.title} – Cap Table
      </h1>

      {/* Navigation */}
      <nav className="flex gap-3 sm:gap-4 mb-6 sm:mb-8 border-b pb-2 overflow-x-auto">
        <Link
          href={`/projects/${project.id}`}
          className="font-medium text-muted-foreground hover:text-primary hover:underline whitespace-nowrap text-sm sm:text-base"
        >
          Overview
        </Link>
        <Link
          href={`/projects/${project.id}/collaborators`}
          className="font-medium text-muted-foreground hover:text-primary hover:underline whitespace-nowrap text-sm sm:text-base"
        >
          Collaborators
        </Link>
        <Link
          href={`/projects/${project.id}/cap-table`}
          className="font-medium text-primary hover:underline border-b-2 border-primary whitespace-nowrap text-sm sm:text-base"
        >
          Cap Table
        </Link>
      </nav>

      {/* Charts Section */}
      <section className="mb-8 sm:mb-10 pb-8">
        {/* Mobile Layout (stacked) */}
        <div className="block sm:hidden space-y-10">
          {/* Composition Chart - Mobile */}
          <div className="space-y-6">
            <div className="flex flex-col items-center">
              <div className="text-center mb-4">
                <span className="font-semibold block text-xl">Composition</span>
                <span className="text-xs text-muted-foreground">
                  a.k.a "Song"
                </span>
              </div>
              <ChartContainer config={{}} className="w-48 h-48">
                <RechartsPrimitive.PieChart>
                  <RechartsPrimitive.Pie
                    data={compositionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    stroke="#fff"
                  />
                </RechartsPrimitive.PieChart>
              </ChartContainer>
            </div>

            {/* Legend for Composition - Mobile */}
            <div className="px-4">
              <h3 className="text-sm font-semibold mb-3 text-center">
                Composition Rights
              </h3>
              <div className="space-y-3">
                {compositionData.map((item, index) => (
                  <div key={index} className="bg-card border rounded-lg p-3">
                    <div className="flex items-center gap-3 mb-1">
                      <span
                        className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                        style={{ background: item.fill }}
                      />
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    {item.pro && (
                      <div className="text-xs text-muted-foreground ml-7">
                        {item.pro} • {item.publisher || "Self-published"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recording Chart - Mobile */}
          <div className="space-y-6">
            <div className="flex flex-col items-center">
              <div className="text-center mb-4">
                <span className="font-semibold block text-xl">Recording</span>
                <span className="text-xs text-muted-foreground">
                  a.k.a "Master"
                </span>
              </div>
              <ChartContainer config={{}} className="w-48 h-48">
                <RechartsPrimitive.PieChart>
                  <RechartsPrimitive.Pie
                    data={soundRecordingData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    stroke="#fff"
                  />
                </RechartsPrimitive.PieChart>
              </ChartContainer>
            </div>

            {/* Legend for Recording - Mobile */}
            <div className="px-4">
              <h3 className="text-sm font-semibold mb-3 text-center">
                Recording Rights
              </h3>
              <div className="space-y-3">
                {soundRecordingData.map((item, index) => (
                  <div key={index} className="bg-card border rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                        style={{ background: item.fill }}
                      />
                      <span className="text-sm font-medium">
                        {item.name} ({item.value.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Funding Progress Chart - Mobile */}
          {targetRaise > 0 && (
            <div className="space-y-6">
              <div className="flex flex-col items-center">
                <div className="text-center mb-4">
                  <span className="font-semibold block text-xl">Funding</span>
                  <span className="text-xs text-muted-foreground">
                    Target vs Raised
                  </span>
                </div>
                <ChartContainer config={{}} className="w-48 h-48">
                  <RechartsPrimitive.PieChart>
                    <RechartsPrimitive.Pie
                      data={fundingChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      stroke="#fff"
                    />
                  </RechartsPrimitive.PieChart>
                </ChartContainer>
              </div>

              {/* Legend for Funding - Mobile */}
              <div className="px-4">
                <h3 className="text-sm font-semibold mb-3 text-center">
                  Funding Progress
                </h3>
                <div className="space-y-3">
                  {fundingChartData.map((item, index) => (
                    <div key={index} className="bg-card border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                          style={{ background: item.fill }}
                        />
                        <span className="text-sm font-medium">
                          {item.name} (${item.value.toLocaleString()})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Layout (side-by-side) */}
        <div className="hidden sm:flex flex-col lg:flex-row gap-8 lg:gap-12 items-center justify-center">
          {/* Composition Chart - Desktop */}
          <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 w-full lg:w-auto">
            <div className="flex flex-col items-center">
              <div className="text-center mb-4">
                <span className="font-semibold block text-2xl">
                  Composition
                </span>
                <span className="text-sm text-muted-foreground">
                  a.k.a "Song"
                </span>
              </div>
              <ChartContainer config={{}} className="w-56 h-56">
                <RechartsPrimitive.PieChart>
                  <RechartsPrimitive.Pie
                    data={compositionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    stroke="#fff"
                  />
                </RechartsPrimitive.PieChart>
              </ChartContainer>
            </div>

            {/* Legend for Composition - Desktop */}
            <div className="flex flex-col gap-3 items-start w-full max-w-xs mt-4 md:mt-0">
              {compositionData.map((item, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                      style={{ background: item.fill }}
                    />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  {item.pro && (
                    <span className="text-xs text-muted-foreground ml-6">
                      {item.pro} • {item.publisher || "Self-published"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recording Chart - Desktop */}
          <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 w-full lg:w-auto">
            <div className="flex flex-col items-center">
              <div className="text-center mb-4">
                <span className="font-semibold block text-2xl">Recording</span>
                <span className="text-sm text-muted-foreground">
                  a.k.a "Master"
                </span>
              </div>
              <ChartContainer config={{}} className="w-56 h-56">
                <RechartsPrimitive.PieChart>
                  <RechartsPrimitive.Pie
                    data={soundRecordingData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    stroke="#fff"
                  />
                </RechartsPrimitive.PieChart>
              </ChartContainer>
            </div>

            {/* Legend for Recording - Desktop */}
            <div className="flex flex-col gap-2 items-start w-full max-w-xs mt-4 md:mt-0">
              {soundRecordingData.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span
                    className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                    style={{ background: item.fill }}
                  />
                  <span className="text-sm">
                    {item.name} ({item.value.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Funding Progress Chart - Desktop */}
          {targetRaise > 0 && (
            <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 w-full lg:w-auto">
              <div className="flex flex-col items-center">
                <div className="text-center mb-4">
                  <span className="font-semibold block text-2xl">Funding</span>
                  <span className="text-sm text-muted-foreground">
                    Target vs Raised
                  </span>
                </div>
                <ChartContainer config={{}} className="w-56 h-56">
                  <RechartsPrimitive.PieChart>
                    <RechartsPrimitive.Pie
                      data={fundingChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      stroke="#fff"
                    />
                  </RechartsPrimitive.PieChart>
                </ChartContainer>
              </div>

              {/* Legend for Funding - Desktop */}
              <div className="flex flex-col gap-2 items-start w-full max-w-xs mt-4 md:mt-0">
                {fundingChartData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                      style={{ background: item.fill }}
                    />
                    <span className="text-sm">
                      {item.name} (${item.value.toLocaleString()})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Metrics below charts */}
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center justify-center mt-8 sm:mt-10">
          <div className="flex flex-col items-center">
            <span className="text-2xl sm:text-3xl font-bold">
              {teamSharesTotal.toLocaleString()}
            </span>
            <span className="text-muted-foreground text-sm sm:text-lg">
              Team shares
            </span>
          </div>

          {fundingData && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-2xl sm:text-3xl font-bold">
                  ${fundingData.totalUSD.toLocaleString()}
                </span>
                <span className="text-muted-foreground text-sm sm:text-lg">
                  Amount raised
                </span>
              </div>

              <div className="flex flex-col items-center">
                <span className="text-2xl sm:text-3xl font-bold">
                  {fundingLoading ? "..." : fundingData.backersCount}
                </span>
                <span className="text-muted-foreground text-sm sm:text-lg">
                  Backers
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Producer Deals Section */}
      {teamMembers.some((member) => member.role === "Producer") && (
        <section className="mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">
            Producer Deals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamMembers
              .filter((member) => member.role === "Producer")
              .map((producer) => (
                <div
                  key={producer.id}
                  className="bg-card border rounded-lg p-4"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-semibold">
                        P
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {producer.name || "Unnamed Producer"}
                      </h3>
                      <p className="text-sm text-muted-foreground capitalize">
                        {producer.deal_type?.replace("_", " ") || "Indie"} Deal
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Revenue Share:
                      </span>
                      <span className="font-medium">
                        {producer.revenue_share_pct?.toFixed(1)}%
                      </span>
                    </div>

                    {producer.flat_fee && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Flat Fee:</span>
                        <span className="font-medium">
                          ${(producer.flat_fee / 100).toLocaleString()}
                        </span>
                      </div>
                    )}

                    {producer.backend_percentage && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Backend %:
                        </span>
                        <span className="font-medium">
                          {producer.backend_percentage}% of net
                        </span>
                      </div>
                    )}

                    {producer.producer_points && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Producer Points:
                        </span>
                        <span className="font-medium">
                          {producer.producer_points} points
                        </span>
                      </div>
                    )}

                    {producer.copyright_type && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Rights:</span>
                        <span className="font-medium capitalize">
                          {producer.copyright_type.replace("_", " ")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Team Members Table */}
      <section className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-semibold mb-4">Team Members</h2>
        <div className="overflow-x-auto">
          <table className="w-full border rounded-md min-w-[600px]">
            <thead>
              <tr className="bg-muted">
                <th className="text-left p-2 sm:p-3 text-xs sm:text-sm">
                  Name
                </th>
                <th className="text-left p-2 sm:p-3 text-xs sm:text-sm">
                  Role
                </th>
                <th className="text-left p-2 sm:p-3 text-xs sm:text-sm">
                  Share (%)
                </th>
                <th className="text-left p-2 sm:p-3 text-xs sm:text-sm">
                  Wallet Address
                </th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((member) => (
                <tr key={member.id} className="border-t">
                  <td className="p-2 sm:p-3 text-xs sm:text-sm">
                    {member.name || "—"}
                  </td>
                  <td className="p-2 sm:p-3 text-xs sm:text-sm">
                    {member.role}
                  </td>
                  <td className="p-2 sm:p-3 text-xs sm:text-sm">
                    {member.revenue_share_pct!.toFixed(1)}%
                  </td>
                  <td className="p-2 sm:p-3">
                    <span className="font-mono text-xs">
                      {member.wallet_address
                        ? `${member.wallet_address.slice(
                            0,
                            6
                          )}...${member.wallet_address.slice(-4)}`
                        : "—"}
                    </span>
                  </td>
                </tr>
              ))}
              {teamMembers.length === 0 && (
                <tr className="border-t">
                  <td
                    colSpan={4}
                    className="p-6 sm:p-8 text-center text-muted-foreground text-sm"
                  >
                    No team members found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Contract Information */}
      {project.splits_contract_address && (
        <section className="mt-6 sm:mt-8">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">
            Contract Information
          </h2>
          <div className="bg-card border rounded-lg p-4 sm:p-6">
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium text-muted-foreground">
                Splits Contract Address
              </label>
              <p className="font-mono text-xs sm:text-sm bg-muted px-3 py-2 rounded break-all">
                {project.splits_contract_address}
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
