"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import TradeModal from "./trade-modal";
import { useRouter } from "next/navigation";
import { Project } from "@/app/api/projects/route";

interface ProjectListItemProps {
  project: Project;
  index: number;
  user?: any;
  onBrowseClick?: (project: Project) => void;
}

export default function ProjectListItem({
  project,
  index,
  user,
  onBrowseClick,
}: ProjectListItemProps) {
  const [showTradeModal, setShowTradeModal] = useState(false);
  const router = useRouter();
  const isAdmin = user?.id === "did:privy:cmbb5x9kw007hjy0ml3sfomp2";
  const isPending = project.status === "pending";
  const handleClick = () => {
    if (isAdmin && isPending) {
      router.push(`/review/${project.id}`);
    } else if (onBrowseClick) {
      onBrowseClick(project);
    }
  };

  // Generate project data for demo - using useMemo to ensure consistent values
  const projectData = useMemo(() => {
    // Generate token price and change
    const tokenPrice = (Math.random() * 0.1).toFixed(4);
    const priceChange = (
      Math.random() *
      10 *
      (Math.random() > 0.5 ? 1 : -1)
    ).toFixed(2);
    const isPositive = Number.parseFloat(priceChange) >= 0;

    // Generate market cap
    const marketCap = (Math.random() * 10 + 0.5).toFixed(1);

    return {
      tokenPrice,
      priceChange,
      isPositive,
      marketCap,
    };
  }, [project.id]);

  return (
    <>
      <motion.div
        className="flex items-center justify-between py-4 px-4 hover:bg-[#131822] rounded-lg transition-colors shadow-sm hover:shadow-md cursor-pointer"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3 }}
        onClick={handleClick}
      >
        <div className="flex items-center">
          <div className="relative mr-3 h-10 w-10 overflow-hidden rounded-full bg-primary/20 flex items-center justify-center">
            {project.cover_art_url ? (
              <img
                src={project.cover_art_url || "/placeholder.svg"}
                alt={project.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-primary">
                {project.title.charAt(0)}
              </span>
            )}
            {isPending && (
              <span className="absolute -top-2 -right-2 bg-yellow-500 text-xs text-black px-2 py-0.5 rounded-full shadow">
                Pending
              </span>
            )}
          </div>

          <div>
            <h3 className="font-medium text-white">{project.title}</h3>
            <div className="text-sm text-muted-foreground">
              by {project.artist_name || "Unknown Artist"}
            </div>
            {/* <div className="text-sm text-muted-foreground">
              ${projectData.marketCap}M MC
            </div> */}
          </div>
        </div>

        {/* <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <div className="font-medium text-white">
              ${projectData.tokenPrice}
            </div>
            <div
              className={`flex items-center text-xs ${
                projectData.isPositive ? "text-green-400" : "text-red-400"
              }`}
            >
              {projectData.isPositive ? (
                <TrendingUp className="mr-1 h-3 w-3" />
              ) : (
                <TrendingDown className="mr-1 h-3 w-3" />
              )}
              {projectData.isPositive ? "+" : ""}
              {projectData.priceChange}%
            </div>
          </div>
        </div> */}
      </motion.div>
    </>
  );
}
