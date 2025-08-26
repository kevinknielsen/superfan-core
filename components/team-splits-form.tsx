"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, ChevronDown, Music, Mic, User, Plus } from "lucide-react";
import { TeamMember } from "@/app/api/project/[projectId]/team/route";

interface TeamSplitsFormProps {
  teamMembers: TeamMember[];
  setTeamMembers: (teamMembers: TeamMember[]) => void;
  onSave: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

// Complete list of roles from the database
const ROLES = [
  "Artist",
  "Producer",
  "Mixer",
  "Curator",
  "Arranger",
  "Songwriter",
  "Musician",
  "Vocalist",
  "Engineer",
  "Mastering",
  "Assistant",
  "Tech",
  "Manager",
  "Label",
  "Publisher",
  "Composer",
  "Lyricist",
  "Performer",
  "Featured Artist",
  "Backing Vocalist",
  "Session Musician",
  "Sound Designer",
  "Studio Manager",
  "A&R",
  "Marketing",
  "Legal",
  "Business Manager",
  "Tour Manager",
  "Merchandise Manager",
  "Social Media Manager",
];

// Shared color palette for chart and legend
const COLORS = [
  "#4285F4",
  "#34A853",
  "#FBBC05",
  "#EA4335",
  "#8AB4F8",
  "#4ECDC4",
  "#FF6B6B",
  "#A239CA",
];

// Helper to normalize shares: rounds to one decimal, adjusts last member to fix total to 100
function normaliseShares(members: TeamMember[]): TeamMember[] {
  if (members.length === 0) return members;
  let rounded = members.map((m) => ({
    ...m,
    revenue_share_pct: Math.round((m.revenue_share_pct || 0) * 10) / 10,
  }));
  let total = rounded.reduce((sum, m) => sum + m.revenue_share_pct, 0);
  if (members.length > 1) {
    // Fix the last member to ensure total is exactly 100
    const diff = Math.round((100 - total) * 10) / 10;
    rounded[rounded.length - 1].revenue_share_pct =
      Math.round((rounded[rounded.length - 1].revenue_share_pct + diff) * 10) /
      10;
  }
  return rounded;
}

export default function TeamSplitsForm({
  teamMembers,
  setTeamMembers,
  onSave,
  onBack,
  isSubmitting,
}: TeamSplitsFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  // Calculate total revenue share
  const totalShare = teamMembers.reduce(
    (sum, member) => sum + (member.revenue_share_pct || 0),
    0
  );
  const isShareValid = Math.abs(totalShare - 100) < 0.01; // Allow for floating point imprecision

  // Filter for members with revenue_share_pct > 0 for chart and preview
  let chartMembers = teamMembers.filter((m) => (m.revenue_share_pct || 0) > 0);
  if (chartMembers.length === 0) {
    chartMembers = [
      {
        id: "default-artist",
        role: "Artist",
        name: "",
        email: "",
        wallet_address: "",
        revenue_share_pct: 100,
        copyright_type: "sound_recording",
      } as TeamMember, // TODO: Check types
    ];
  }
  console.log("chartMembers:", chartMembers, "teamMembers:", teamMembers);

  const addTeamMember = () => {
    if (teamMembers.length >= 5) {
      setErrors({ teamSize: "Maximum 5 team members allowed" });
      return;
    }

    // Calculate default share for new member
    const equalShare = Math.floor(100 / (teamMembers.length + 1));

    // Adjust existing members' shares
    const adjustedMembers = teamMembers.map((member) => ({
      ...member,
      revenue_share_pct: Math.floor(
        ((member.revenue_share_pct || 0) * (100 - equalShare)) / 100
      ),
    }));

    setTeamMembers(adjustedMembers);

    setErrors({});
  };

  const removeTeamMember = (id: string) => {
    if (teamMembers.length <= 1) {
      setErrors({ teamSize: "At least one team member is required" });
      return;
    }

    const memberToRemove = teamMembers.find((m) => m.id === id);
    if (!memberToRemove) return;

    const remainingShare = memberToRemove.revenue_share_pct || 0;
    const remainingMembers = teamMembers.filter((m) => m.id !== id);

    // Redistribute the share proportionally
    const totalRemainingShare = remainingMembers.reduce(
      (sum, m) => sum + (m.revenue_share_pct || 0),
      0
    );

    const updatedMembers = remainingMembers.map((member) => ({
      ...member,
      revenue_share_pct:
        totalRemainingShare === 0
          ? 100 / remainingMembers.length
          : (member.revenue_share_pct || 0) +
            (remainingShare * (member.revenue_share_pct || 0)) /
              totalRemainingShare,
    }));

    console.log("REMOVE TEAM MEMBER", updatedMembers);

    setTeamMembers(updatedMembers);
    setErrors({});
  };

  const updateTeamMember = (
    id: string,
    field: keyof TeamMember,
    value: string | number
  ) => {
    const prev = teamMembers;
    if (field !== "revenue_share_pct") {
      // Non-revenue_share_pct fields: update as usual
      return prev.map((member) =>
        member.id === id ? { ...member, [field]: value } : member
      );
    }
    // revenue_share_pct update: distribute remaining among others, preserve order
    const newValue =
      typeof value === "number" ? value : Number.parseFloat(value as string);
    if (Number.isNaN(newValue)) return prev; // ignore invalid entry
    const clampedValue = Math.max(0, Math.min(100, newValue));
    const totalOther = prev.length > 1 ? 100 - clampedValue : 0;
    const sumOthers = prev
      .filter((m) => m.id !== id)
      .reduce((sum, m) => sum + (m.revenue_share_pct || 0), 0);
    let updated = prev.map((member) => {
      if (member.id === id) {
        return { ...member, revenue_share_pct: clampedValue };
      } else {
        return {
          ...member,
          revenue_share_pct:
            sumOthers > 0
              ? ((member.revenue_share_pct || 0) / sumOthers) * totalOther
              : totalOther / (prev.length - 1),
        };
      }
    });
    // After redistribution, normalise to avoid floating-point drift
    setTeamMembers(normaliseShares(updated));

    // Clear any errors related to this field
    if (errors[`${id}-${field}`]) {
      const newErrors = { ...errors };
      delete newErrors[`${id}-${field}`];
      setErrors(newErrors);
    }
  };

  const toggleMemberExpanded = (id: string) => {
    setExpandedMember(expandedMember === id ? null : id);
  };

  // Skip validation to allow advancing without filling out info
  const handleSubmit = () => {
    console.log("handleSubmit (teamMembers):", teamMembers);
    onSave();
  };

  // Get role icon based on role name
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "Artist":
      case "Featured Artist":
      case "Performer":
        return <Mic className="h-4 w-4 text-white" />;
      case "Producer":
      case "Engineer":
      case "Mixer":
      case "Mastering":
      case "Sound Designer":
      case "Studio Manager":
        return <Music className="h-4 w-4 text-white" />;
      default:
        return <User className="h-4 w-4 text-white" />;
    }
  };

  // Get color based on role
  const getRoleColor = (role: string) => {
    switch (role) {
      case "Artist":
      case "Featured Artist":
        return "bg-blue-500";
      case "Producer":
        return "bg-green-500";
      case "Engineer":
      case "Mixer":
      case "Mastering":
        return "bg-purple-500";
      case "Songwriter":
      case "Composer":
      case "Lyricist":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <motion.div
        className="mx-auto pb-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Collaborators</h2>
          <p className="text-muted-foreground text-sm">
            Add your team members and set basic revenue splits.
            <span className="font-medium text-blue-600">
              {" "}
              You can add detailed copyright info, producer deals, and wallet
              addresses later!
            </span>
          </p>
        </div>

        <div className="space-y-6">
          {/* Team Members Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-medium">Team Members</h3>
              <motion.button
                type="button"
                onClick={addTeamMember}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm hover:bg-accent/10"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Plus className="h-3.5 w-3.5" /> Add Member
              </motion.button>
            </div>

            {errors.teamSize && (
              <p className="text-sm text-destructive mb-2">{errors.teamSize}</p>
            )}

            <div className="space-y-2">
              {teamMembers.map((member, index) => (
                <motion.div
                  key={member.id}
                  className={`rounded-md border ${
                    member.role === "Artist"
                      ? "border-blue-500/20"
                      : "border-green-500/20"
                  } overflow-hidden`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.05,
                    ease: "easeOut",
                  }}
                  layout
                >
                  <div
                    className={`flex items-center justify-between p-3 cursor-pointer ${
                      member.role === "Artist"
                        ? "bg-blue-500/5"
                        : "bg-green-500/5"
                    }`}
                    onClick={() => toggleMemberExpanded(member.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${getRoleColor(
                          member.role
                        )}`}
                      >
                        {getRoleIcon(member.role)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{member.role}</span>
                        </div>
                        {member.name && (
                          <p className="text-xs text-muted-foreground">
                            {member.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-medium">
                          {member.revenue_share_pct.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Revenue Share
                        </div>
                      </div>
                      <motion.div
                        animate={{
                          rotate: expandedMember === member.id ? 180 : 0,
                        }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </motion.div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedMember === member.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="p-3 border-t border-border">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Role
                              </label>
                              <select
                                value={member.role}
                                onChange={(e) =>
                                  updateTeamMember(
                                    member.id,
                                    "role",
                                    e.target.value
                                  )
                                }
                                className="input-field w-full py-2 text-sm"
                              >
                                {ROLES.map((role) => (
                                  <option key={role} value={role}>
                                    {role}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Name
                              </label>
                              <input
                                type="text"
                                value={member.name || undefined}
                                onChange={(e) =>
                                  updateTeamMember(
                                    member.id,
                                    "name",
                                    e.target.value
                                  )
                                }
                                placeholder="Full name"
                                className="input-field w-full py-2 text-sm"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Email
                              </label>
                              <input
                                type="email"
                                value={member.email || undefined}
                                onChange={(e) =>
                                  updateTeamMember(
                                    member.id,
                                    "email",
                                    e.target.value
                                  )
                                }
                                placeholder="Email address"
                                className="input-field w-full py-2 text-sm"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Wallet Address
                              </label>
                              <input
                                type="text"
                                value={member.wallet_address || undefined}
                                onChange={(e) =>
                                  updateTeamMember(
                                    member.id,
                                    "wallet_address",
                                    e.target.value
                                  )
                                }
                                placeholder="0x..."
                                className="input-field w-full py-2 text-sm"
                              />
                            </div>

                            {/* Simplified fields - detailed editing moved to Collaborators page */}
                            {/* Simple, reliable slider implementation */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-medium">
                                  Revenue Share (%)
                                </label>
                                <span className="text-xs font-medium">
                                  {member.revenue_share_pct.toFixed(1)}%
                                </span>
                              </div>
                              <div className="relative">
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  value={member.revenue_share_pct}
                                  onChange={(e) =>
                                    updateTeamMember(
                                      member.id,
                                      "revenue_share_pct",
                                      Number.parseFloat(e.target.value)
                                    )
                                  }
                                  className="w-full h-2 appearance-none bg-gray-700 rounded-lg cursor-pointer"
                                  style={{
                                    background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${member.revenue_share_pct}%, #374151 ${member.revenue_share_pct}%, #374151 100%)`,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Info callout about detailed editing */}
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <p className="text-xs text-blue-700">
                                💡 <strong>Add details later:</strong> Copyright
                                types, producer deals, and PRO information can
                                be edited in the Collaborators tab after
                                creating your project.
                              </p>
                            </div>

                            {teamMembers.length > 1 && (
                              <div className="flex justify-end">
                                <motion.button
                                  type="button"
                                  onClick={() => removeTeamMember(member.id)}
                                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 25,
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>Remove</span>
                                </motion.button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>

            <div className="flex justify-end text-sm mt-2">
              <motion.span
                className={`font-medium ${
                  isShareValid ? "text-green-500" : "text-yellow-500"
                }`}
                animate={{
                  color: isShareValid ? "rgb(34, 197, 94)" : "rgb(234, 179, 8)",
                }}
                transition={{ duration: 0.3 }}
              >
                Total Share: {totalShare.toFixed(1)}%
              </motion.span>
            </div>
          </div>

          {/* Revenue Split Chart */}
          <div className="rounded-md border border-border p-4">
            <h3 className="text-base font-medium mb-3">Revenue Split</h3>

            <div className="flex justify-center mb-4">
              <motion.div
                className="relative h-32 w-32"
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
                  {chartMembers.map((member, index) => {
                    const percent = Number(member.revenue_share_pct) || 0;
                    if (!isFinite(percent) || percent <= 0) return null;
                    const startPercent = chartMembers
                      .slice(0, index)
                      .reduce(
                        (sum, m) => sum + (Number(m.revenue_share_pct) || 0),
                        0
                      );
                    const startAngle = (startPercent / 100) * 360;
                    const endAngle = ((startPercent + percent) / 100) * 360;
                    const startX =
                      50 + 40 * Math.cos((startAngle * Math.PI) / 180);
                    const startY =
                      50 + 40 * Math.sin((startAngle * Math.PI) / 180);
                    const endX = 50 + 40 * Math.cos((endAngle * Math.PI) / 180);
                    const endY = 50 + 40 * Math.sin((endAngle * Math.PI) / 180);
                    const largeArcFlag = percent > 50 ? 1 : 0;
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
                        fill={
                          member.id === "default-artist"
                            ? "#444"
                            : COLORS[index % COLORS.length]
                        }
                        stroke="#0E0E14"
                        strokeWidth="1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
                      />
                    );
                  })}
                  <circle cx="50" cy="50" r="25" fill="#0E0E14" />
                </motion.svg>
              </motion.div>
            </div>

            <div className="space-y-1">
              {chartMembers.map((member, index) => {
                const bulletColor =
                  member.id === "default-artist"
                    ? "#444"
                    : COLORS[index % COLORS.length];
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
                        style={{ backgroundColor: bulletColor }}
                      />
                      <span className="text-sm">
                        {member.name || member.role}
                      </span>
                    </div>
                    <span className="text-sm">
                      {member.revenue_share_pct.toFixed(1)}%
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-8">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md bg-transparent px-3 py-2 text-sm text-foreground hover:bg-accent/50"
          >
            Back
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90"
            disabled={isSubmitting}
          >
            Continue
          </button>
        </div>
      </motion.div>
    </form>
  );
}
