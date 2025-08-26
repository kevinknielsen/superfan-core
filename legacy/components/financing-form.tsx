"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { DollarSign, Percent, HelpCircle } from "lucide-react";
import { TeamMember } from "@/app/api/project/[projectId]/team/route";

interface FinancingFormProps {
  initialTeamMembers: TeamMember[];
  onSave: (data: {
    teamMembers: TeamMember[];
    target_raise: number | null;
    endDate: string;
    enabled: boolean;
  }) => void;
  onBack: () => void;
  enabled?: boolean;
}

export default function FinancingForm({
  initialTeamMembers,
  onSave,
  onBack,
  enabled: enabledProp,
}: FinancingFormProps) {
  const [fundingAmount, setFundingAmount] = useState<string>("");
  const [backersPercentage, setBackersPercentage] = useState<string>("20");
  const [teamMembers, setTeamMembers] =
    useState<TeamMember[]>(initialTeamMembers);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [enabled, setEnabled] = useState<boolean | null>(enabledProp ?? null);

  // Check if backers already exist in team members
  // const existingBackersIndex = teamMembers.findIndex(
  //   (member) => member.role === "Backers"
  // );

  const handleBackersPercentageChange = (value: string) => {
    // Only allow numbers and limit to 0-100
    const percentage = Math.min(100, Math.max(0, Number(value) || 0));
    setBackersPercentage(percentage.toString());
    // Do NOT update teamMembers or allocations
  };

  const handleSubmit = () => {
    if (enabled === null) {
      setErrors({
        enabled: "Please select whether you want to raise funding.",
      });
      return;
    }
    if (enabled === false) {
      onSave({
        teamMembers,
        target_raise: null,
        endDate: "",
        enabled: false,
      });
      return;
    }
    const numericAmount = Number(fundingAmount.replace(/,/g, ""));
    if (!numericAmount || isNaN(numericAmount)) {
      setErrors({ target_raise: "Please enter a valid funding amount" });
      return;
    }
    if (!endDate) {
      setErrors({ endDate: "Please select an end date" });
      return;
    }
    onSave({
      teamMembers,
      target_raise: numericAmount,
      endDate,
      enabled: true,
    });
  };

  // Generate colors for the chart
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

  return (
    <motion.div
      className="mx-auto pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Project Financing</h2>
        <p className="text-muted-foreground text-sm">
          Decide if you want to raise funding for your project.
        </p>
      </div>

      <div className="space-y-8">
        <div className="rounded-md border border-border p-6">
          <h3 className="text-lg font-medium mb-4">
            Do you want to raise financing for this project?
          </h3>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {errors.enabled && (
              <p className="text-sm text-destructive mb-2">{errors.enabled}</p>
            )}
            <motion.button
              type="button"
              className={`flex-1 p-4 rounded-md border ${
                enabled === true
                  ? "border-primary ring-2 ring-primary"
                  : "border-border hover:bg-accent/10"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setEnabled(true)}
            >
              <div className="flex items-center justify-center mb-2">
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-medium text-center">Yes, raise funding</h4>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Allocate a percentage to future backers
              </p>
            </motion.button>

            <motion.button
              type="button"
              className={`flex-1 p-4 rounded-md border ${
                enabled === false
                  ? "border-primary ring-2 ring-primary"
                  : "border-border hover:bg-accent/10"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setEnabled(false)}
            >
              <div className="flex items-center justify-center mb-2">
                <HelpCircle className="h-8 w-8 text-muted" />
              </div>
              <h4 className="font-medium text-center">No, skip funding</h4>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Continue without raising funds
              </p>
            </motion.button>
          </div>

          {enabled === true && (
            <motion.div
              className="space-y-6 mt-8"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="space-y-2">
                <label
                  htmlFor="target_raise"
                  className="block text-sm font-medium"
                >
                  How much do you want to raise?
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <DollarSign className="h-5 w-5 text-muted" />
                  </div>
                  <input
                    type="text"
                    id="target_raise"
                    value={fundingAmount}
                    onChange={(e) => {
                      // Only allow numbers and commas
                      const value = e.target.value.replace(/[^0-9,]/g, "");
                      setFundingAmount(value);
                      if (errors.target_raise) {
                        setErrors({});
                      }
                    }}
                    placeholder="10,000"
                    className="input-field w-full py-2.5 pl-10"
                  />
                </div>
                {errors.target_raise && (
                  <p className="text-sm text-destructive">
                    {errors.target_raise}
                  </p>
                )}
              </div>

              {/* <div className="space-y-2">
                <label
                  htmlFor="backersPercentage"
                  className="block text-sm font-medium"
                >
                  What percentage will you give to backers?
                </label>
                <div className="relative">
                  <input
                    type="range"
                    id="backersPercentage"
                    min="0"
                    max="100"
                    step="1"
                    value={backersPercentage}
                    onChange={(e) =>
                      handleBackersPercentageChange(e.target.value)
                    }
                    className="w-full h-2 appearance-none bg-gray-700 rounded-lg cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${backersPercentage}%, #374151 ${backersPercentage}%, #374151 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm font-medium">
                    Backers percentage:
                  </span>
                  <div className="flex items-center bg-primary/20 text-primary px-3 py-1 rounded-full">
                    <Percent className="h-3 w-3 mr-1" />
                    <span className="font-medium">{backersPercentage}%</span>
                  </div>
                </div>
              </div> */}

              <div className="space-y-2">
                <label htmlFor="endDate" className="block text-sm font-medium">
                  Funding End Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    id="endDate"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-field w-full py-2.5"
                    min={new Date().toISOString().slice(0, 10)}
                  />
                </div>
              </div>

              {/* Revenue Split Preview */}
              {/* <div className="mt-8">
                <h4 className="text-sm font-medium mb-4">
                  Revenue Split Preview
                </h4>

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
                      {teamMembers.map((member, index) => {
                        const percent = Number(member.revenue_share_pct) || 0;
                        const startPercent = teamMembers
                          .slice(0, index)
                          .reduce(
                            (sum, m) =>
                              sum + (Number(m.revenue_share_pct) || 0),
                            0
                          );
                        if (!isFinite(percent) || percent <= 0) return null;
                        const startAngle = (startPercent / 100) * 360;
                        const endAngle = ((startPercent + percent) / 100) * 360;
                        const startX =
                          50 + 40 * Math.cos((startAngle * Math.PI) / 180);
                        const startY =
                          50 + 40 * Math.sin((startAngle * Math.PI) / 180);
                        const endX =
                          50 + 40 * Math.cos((endAngle * Math.PI) / 180);
                        const endY =
                          50 + 40 * Math.sin((endAngle * Math.PI) / 180);
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
                              member.role === "Backers"
                                ? "#FF6B6B"
                                : colors[index % colors.length]
                            }
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

                <div className="space-y-1">
                  {teamMembers.map((member, index) => (
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
                          style={{
                            backgroundColor:
                              member.role === "Backers"
                                ? "#FF6B6B"
                                : colors[index % colors.length],
                          }}
                        />
                        <span className="text-sm">
                          {member.role === "Backers"
                            ? "Project Backers"
                            : member.name || member.role}
                        </span>
                      </div>
                      <span className="text-sm">
                        {member.revenue_share_pct.toFixed(1)}%
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div> */}
            </motion.div>
          )}
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
          type="button"
          onClick={handleSubmit}
          className="rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90"
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
}
