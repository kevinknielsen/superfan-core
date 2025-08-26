"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  Music,
  ImageIcon,
  User,
  DollarSign,
  Users,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useFinancing } from "@/hooks/use-financing";
import { Project } from "@/app/api/projects/route";

interface ReviewProjectProps {
  project: Omit<Project, "id" | "createdAt">;
  onBack: () => void;
  onPublish: () => void;
  isSubmitting: boolean;
}

// Format funding amount with commas
const formatFundingAmount = (amount: number | null | undefined) => {
  if (!amount) return "0";
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export default function ReviewProject({
  project,
  onBack,
  onPublish,
  isSubmitting,
}: ReviewProjectProps) {
  // Check if backers exist in team members
  const hasBackers = project.team_members?.some(
    (member) => member.role === "Backers"
  ) || false;

  // Get backers percentage if they exist
  const backersPercentage = hasBackers
    ? project.team_members?.find((member) => member.role === "Backers")
        ?.revenue_share_pct || 0
    : 0;

  return (
    <motion.div
      className="mx-auto pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Review Project</h2>
        <p className="text-muted-foreground text-sm">
          Review your project details before publishing.
        </p>
      </div>

      <div className="space-y-8">
        {/* Project Information Section */}
        <div className="rounded-md border border-border overflow-hidden">
          <div className="bg-accent/10 px-4 py-3 border-b border-border">
            <h3 className="font-medium">Project Information</h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Project Title
                    </h4>
                    <p className="font-medium">
                      {project.title || "Untitled Project"}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Artist/Creator
                    </h4>
                    <p className="font-medium">
                      {project.artist_name || "Unknown Artist"}
                    </p>
                  </div>

                  {/* {project.releaseDate && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">
                        Release Date
                      </h4>
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-primary" />
                        <p>{formatDate(project.releaseDate)}</p>
                      </div>
                    </div>
                  )} */}

                  {project.description && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">
                        Description
                      </h4>
                      <p className="text-sm">{project.description}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {project.cover_art_url ? (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Artwork
                    </h4>
                    <div className="relative rounded-md overflow-hidden border border-border h-40">
                      <img
                        src={project.cover_art_url || "/placeholder.svg"}
                        alt="Project Artwork"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Artwork
                    </h4>
                    <div className="flex h-40 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-transparent">
                      <ImageIcon className="mb-2 h-6 w-6 text-muted" />
                      <span className="text-sm text-muted-foreground">
                        No artwork uploaded
                      </span>
                    </div>
                  </div>
                )}

                {project.track_demo_url && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Demo Track
                    </h4>
                    <div className="flex items-center rounded-md border border-border p-3">
                      <Music className="mr-3 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">
                          {(() => {
                            try {
                              const url = new URL(project.track_demo_url);
                              return decodeURIComponent(
                                url.pathname.split("/").pop() || ""
                              );
                            } catch {
                              return project.track_demo_url;
                            }
                          })()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Demo track
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Financing Section - Only show if funding amount exists */}
        {project.financing?.target_raise && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="bg-accent/10 px-4 py-3 border-b border-border">
              <h3 className="font-medium">Project Financing</h3>
            </div>
            <div className="p-4">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Funding Goal
                  </h4>
                  <div className="flex items-center">
                    <DollarSign className="h-5 w-5 mr-2 text-primary" />
                    <p className="font-medium">
                      ${formatFundingAmount(project.financing.target_raise)}
                    </p>
                  </div>
                </div>

                <div className="flex-1">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Backers Allocation
                  </h4>
                  <div className="flex items-center">
                    {hasBackers ? (
                      <div className="flex items-center">
                        <Users className="h-5 w-5 mr-2 text-primary" />
                        <p className="font-medium">
                          {backersPercentage}% of revenue
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        No allocation for backers
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collaborators Section */}
        {/* <div className="rounded-md border border-border overflow-hidden">
          <div className="bg-accent/10 px-4 py-3 border-b border-border">
            <h3 className="font-medium">Collaborators</h3>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {Array.isArray(project.team_members) &&
              project.team_members?.length > 0 ? (
                <>
                  <div className="grid grid-cols-12 text-sm font-medium text-muted-foreground px-2 py-1">
                    <div className="col-span-5">Name/Role</div>
                    <div className="col-span-5">Email/Wallet</div>
                    <div className="col-span-2 text-right">Share</div>
                  </div>

                  {project.team_members.map((member, index) => (
                    <div
                      key={member.id}
                      className={`grid grid-cols-12 rounded-md p-3 ${
                        index % 2 === 0 ? "bg-accent/5" : ""
                      }`}
                    >
                      <div className="col-span-5 flex items-center">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center mr-3">
                          {member.role === "Backers" ? (
                            <Users className="h-4 w-4 text-primary" />
                          ) : (
                            <User className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.name || "Unnamed"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.role}
                          </p>
                        </div>
                      </div>
                      <div className="col-span-5">
                        {member.role === "Backers" ? (
                          <p className="text-sm">Project Backers</p>
                        ) : (
                          <>
                            <p className="text-sm truncate">
                              {member.email || "No email"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {member.wallet_address || "No wallet"}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                        <p className="font-medium">
                          {typeof member.revenue_share_pct === "number"
                            ? member.revenue_share_pct.toFixed(1)
                            : "0.0"}
                          %
                        </p>
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-end mt-2 pt-2 border-t border-border">
                    <p className="text-sm font-medium">
                      Total:{" "}
                      {project.team_members.reduce(
                        (sum, member) => sum + (member.revenue_share_pct || 0),
                        0
                      )}
                      %
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-muted-foreground">
                    No collaborators added
                  </p>
                </div>
              )}
            </div>
          </div>
        </div> */}

        {/* Revenue Split Chart */}
        {/* {Array.isArray(project.team_members) &&
          project.team_members?.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-accent/10 px-4 py-3 border-b border-border">
                <h3 className="font-medium">Revenue Split</h3>
              </div>
              <div className="p-4 flex flex-col items-center">
                <div className="flex justify-center mb-6">
                  <motion.div
                    className="relative h-40 w-40"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  >
                    <motion.svg
                      viewBox="0 0 100 100"
                      className="h-full w-full -rotate-90"
                      initial={{ rotate: -180 }}
                      animate={{ rotate: -90 }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                      {project.team_members.map((member, index) => {
                        // Calculate the percentage of the circle
                        const percent = member.revenue_share_pct || 0;
                        const startPercent = project.team_members
                          .slice(0, index)
                          .reduce((sum, m) => sum + percent, 0);

                        // Convert to coordinates on the circle
                        const startAngle = (startPercent / 100) * 360;
                        const endAngle = ((startPercent + percent) / 100) * 360;

                        // Calculate the SVG arc path
                        const startX =
                          50 + 40 * Math.cos((startAngle * Math.PI) / 180);
                        const startY =
                          50 + 40 * Math.sin((startAngle * Math.PI) / 180);
                        const endX =
                          50 + 40 * Math.cos((endAngle * Math.PI) / 180);
                        const endY =
                          50 + 40 * Math.sin((endAngle * Math.PI) / 180);

                        // Determine if the arc should be drawn the long way around
                        const largeArcFlag = percent > 50 ? 1 : 0;

                        // Generate a color based on index or role
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
                        // Use a special color for backers
                        const color =
                          member.role === "Backers"
                            ? "#FF6B6B"
                            : colors[index % colors.length];

                        // Create the SVG path
                        const path = [
                          `M 50 50`,
                          `L ${startX} ${startY}`,
                          `A 40 40 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                          `Z`,
                        ].join(" ");

                        return (
                          <motion.path
                            key={member.id}
                            d={path}
                            fill={color}
                            stroke="#0E0E14"
                            strokeWidth="1"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{
                              duration: 0.3,
                              delay: 0.5 + index * 0.1,
                            }}
                          />
                        );
                      })}
                      <circle cx="50" cy="50" r="25" fill="#0E0E14" />
                    </motion.svg>
                  </motion.div>
                </div>

                <div className="space-y-1 w-full max-w-md">
                  {project.team_members.map((member, index) => {
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
                    // Use a special color for backers
                    const color =
                      member.role === "Backers"
                        ? "#FF6B6B"
                        : colors[index % colors.length];

                    return (
                      <motion.div
                        key={member.id}
                        className="flex items-center justify-between"
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.8 + index * 0.1 }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm">
                            {member.role === "Backers"
                              ? "Project Backers"
                              : member.name || member.role}
                          </span>
                        </div>
                        <span className="text-sm">
                          {typeof member.revenue_share_pct === "number"
                            ? member.revenue_share_pct.toFixed(1)
                            : "0.0"}
                          %
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )} */}
      </div>
    </motion.div>
  );
}
