"use client";

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "h-8 w-auto" }: LogoProps) {
  return (
    <div className={className}>
      <div className="flex items-center text-xl font-bold">
        <span className="bg-gradient-to-r from-primary to-[#D13F6A] bg-clip-text text-transparent">
          Super
        </span>
        <span className="text-foreground">fan</span>
        <span className="ml-1 inline-block h-2 w-2 rounded-full bg-primary"></span>
      </div>
    </div>
  );
}
