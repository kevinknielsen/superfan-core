"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Music, Plus } from "lucide-react";

export default function EmptyState() {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
        <Music className="h-8 w-8 text-primary" />
      </div>
      <h2 className="mb-2 text-xl font-medium">No projects yet</h2>
      <p className="mb-6 text-muted-foreground">
        Create your first music project to get started
      </p>
      <Link
        href="/launch"
        className="inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-white hover:bg-primary/90"
      >
        <Plus className="mr-2 h-4 w-4" />
        New Project
      </Link>
    </motion.div>
  );
}
