"use client";

import React from "react";
import { Loader } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  color?: "slate" | "blue" | "red" | "green" | "white";
  variant?: "default" | "round" | "dots" | "ios" | "pulse" | "bars" | "wave";
  className?: string;
}

interface SizeProps {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

interface ColorProps {
  slate: string;
  blue: string;
  red: string;
  green: string;
  white: string;
}

const sizesClasses: SizeProps = {
  xs: "w-4 h-4",
  sm: "w-5 h-5",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-10 h-10",
};

const fillClasses: ColorProps = {
  slate: "fill-foreground",
  blue: "fill-blue-500",
  red: "fill-red-500",
  green: "fill-emerald-500",
  white: "fill-background",
};

const strokeClasses: ColorProps = {
  slate: "stroke-foreground",
  blue: "stroke-blue-500",
  red: "stroke-red-500",
  green: "stroke-emerald-500",
  white: "stroke-background",
};

export function DefaultSpinner({
  size = "md",
  color = "slate",
  className,
}: SpinnerProps) {
  return (
    <div aria-label="Loading..." role="status" className={className}>
      <Loader
        className={cn("animate-spin", sizesClasses[size], strokeClasses[color])}
      />
    </div>
  );
}

export function RoundSpinner({
  size = "md",
  color = "slate",
  className,
}: SpinnerProps) {
  return (
    <div aria-label="Loading..." role="status" className={className}>
      <svg
        className={cn("animate-spin", sizesClasses[size], fillClasses[color])}
        viewBox="3 3 18 18"
      >
        <path
          className="opacity-20"
          d="M12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5ZM3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12Z"
        ></path>
        <path d="M16.9497 7.05015C14.2161 4.31648 9.78392 4.31648 7.05025 7.05015C6.65973 7.44067 6.02656 7.44067 5.63604 7.05015C5.24551 6.65962 5.24551 6.02646 5.63604 5.63593C9.15076 2.12121 14.8492 2.12121 18.364 5.63593C18.7545 6.02646 18.7545 6.65962 18.364 7.05015C17.9734 7.44067 17.3403 7.44067 16.9497 7.05015Z"></path>
      </svg>
    </div>
  );
}

export function DotsSpinner({
  size = "md",
  color = "slate",
  className,
}: SpinnerProps) {
  return (
    <div
      className={cn("flex items-center space-x-2", className)}
      aria-label="Loading..."
      role="status"
    >
      <div className="flex space-x-2">
        <motion.div
          className={cn("rounded-full bg-current", sizesClasses[size])}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 1.1,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
        <motion.div
          className={cn("rounded-full bg-current", sizesClasses[size])}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 1.1,
            ease: "easeInOut",
            repeat: Infinity,
            delay: 0.3,
          }}
        />
        <motion.div
          className={cn("rounded-full bg-current", sizesClasses[size])}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 1.1,
            ease: "easeInOut",
            repeat: Infinity,
            delay: 0.6,
          }}
        />
      </div>
    </div>
  );
}

export function IOSSpinner({ size = "md", className }: SpinnerProps) {
  const sizeClass = {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
    xl: "h-8 w-8",
  };

  return (
    <div
      className={cn("relative inline-block", sizeClass[size], className)}
      aria-label="Loading..."
      role="status"
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute h-[30%] w-[8%] rounded-[1px] bg-foreground opacity-0"
          style={{
            left: "50%",
            top: "0%",
            transform: `rotate(${i * 30}deg)`,
            transformOrigin: "0% 150%",
            animation: "spinner-fade 1s linear infinite",
            animationDelay: `${i * 0.083}s`,
          }}
        />
      ))}
    </div>
  );
}

export function PulseSpinner({
  size = "md",
  color = "slate",
  className,
}: SpinnerProps) {
  const getColorClass = (color: string) => {
    switch (color) {
      case "blue":
        return "border-blue-500";
      case "red":
        return "border-red-500";
      case "green":
        return "border-emerald-500";
      case "white":
        return "border-background";
      default:
        return "border-foreground";
    }
  };
  return (
    <div
      className={cn("relative", className)}
      aria-label="Loading..."
      role="status"
    >
      <div
        className={cn(
          "absolute inset-0 rounded-full border-2",
          sizesClasses[size],
          color === "slate" ? "border-foreground" : getColorClass(color),
        )}
        style={{
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
    </div>
  );
}

export function BarsSpinner({
  size = "md",
  color = "slate",
  className,
}: SpinnerProps) {
  const barWidth = {
    xs: "w-1",
    sm: "w-1.5",
    md: "w-2",
    lg: "w-2.5",
    xl: "w-3",
  };

  const getColorClass = (color: string) => {
    switch (color) {
      case "blue":
        return "bg-blue-500";
      case "red":
        return "bg-red-500";
      case "green":
        return "bg-emerald-500";
      case "white":
        return "bg-background";
      default:
        return "bg-foreground";
    }
  };

  return (
    <div
      className={cn("flex gap-1.5", className)}
      aria-label="Loading..."
      role="status"
    >
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-full bg-foreground",
            barWidth[size],
            color === "slate" ? "bg-foreground" : getColorClass(color),
          )}
          style={{
            animation: "bars 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

export function WaveSpinner({
  size = "md",
  color = "slate",
  className,
}: SpinnerProps) {
  const barWidth = {
    xs: "w-0.5",
    sm: "w-0.5",
    md: "w-1",
    lg: "w-1.5",
    xl: "w-2",
  };

  const heights = {
    xs: ["6px", "9px", "12px", "9px", "6px"],
    sm: ["8px", "12px", "16px", "12px", "8px"],
    md: ["10px", "15px", "20px", "15px", "10px"],
    lg: ["12px", "18px", "24px", "18px", "12px"],
    xl: ["14px", "21px", "28px", "21px", "14px"],
  };

  const getColorClass = (color: string) => {
    switch (color) {
      case "blue":
        return "bg-blue-500";
      case "red":
        return "bg-red-500";
      case "green":
        return "bg-emerald-500";
      case "white":
        return "bg-background";
      default:
        return "bg-foreground";
    }
  };

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      aria-label="Loading..."
      role="status"
    >
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full bg-foreground",
            barWidth[size],
            color === "slate" ? "bg-foreground" : getColorClass(color),
          )}
          style={{
            animation: "wave 1s ease-in-out infinite",
            animationDelay: `${i * 100}ms`,
            height: heights[size][i],
          }}
        />
      ))}
    </div>
  );
}

export function Spinner({
  variant = "default",
  size = "md",
  color = "slate",
  className,
}: SpinnerProps) {
  switch (variant) {
    case "default":
      return <DefaultSpinner size={size} color={color} className={className} />;
    case "round":
      return <RoundSpinner size={size} color={color} className={className} />;
    case "dots":
      return <DotsSpinner size={size} color={color} className={className} />;
    case "ios":
      return <IOSSpinner size={size} className={className} />;
    case "pulse":
      return <PulseSpinner size={size} color={color} className={className} />;
    case "bars":
      return <BarsSpinner size={size} color={color} className={className} />;
    case "wave":
      return <WaveSpinner size={size} color={color} className={className} />;
    default:
      return <DefaultSpinner size={size} color={color} className={className} />;
  }
}

export default Spinner;
