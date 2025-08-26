"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { usePrivy } from "@/lib/auth-context";
import { useFarcaster } from "@/lib/farcaster-context";
import Header from "@/components/header";
import LaunchForm from "@/components/launch-form";
import { useProject } from "@/hooks/use-projects";
import { Project } from "../api/projects/route";

function LaunchContent() {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  const { isInWalletApp } = useFarcaster();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");

  useEffect(() => {
    if (ready && !authenticated && !isInWalletApp) {
      router.push("/login?redirect=/launch");
    }
  }, [ready, authenticated, router, isInWalletApp]);

  const { data: project, error, status, refetch } = useProject(projectId);

  if (error || (status === "success" && !project)) {
    toast({
      title: "Failed to load project",
      description: error?.message || "Could not find project.",
      variant: "destructive",
    });
  }

  const handleSubmit = async (formData: Omit<Project, "id" | "created_at">) => {
    setIsSubmitting(true);
    try {
      await refetch();

      toast({
        title: "Your project is live! 🚀",
        description: `"${formData.title}" has been published successfully.`,
      });

      router.push("/"); // or open modal with newProject
      setIsSubmitting(false);
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  if (!ready || (!authenticated && !isInWalletApp)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Header showBackButton />

      <main className="container mx-auto px-4 py-8">
        <motion.h1
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          New Project
        </motion.h1>

        <LaunchForm
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          initialProject={project}
        />
      </main>
    </motion.div>
  );
}

export default function LaunchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-pulse">Loading...</div>
        </div>
      }
    >
      <LaunchContent />
    </Suspense>
  );
}
