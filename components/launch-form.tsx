"use client";

import React, { useEffect, useState } from "react";

import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Music, ImageIcon, Save } from "lucide-react";
import TeamSplitsForm from "./team-splits-form";
// Financing form removed (legacy funding feature disabled)
import ReviewProject from "./review-project";
import { usePrivy } from "@/lib/auth-context";
import { useWallets } from "@privy-io/react-auth";
import { UserAgreementWarning } from "./UserAgreementWarning";
import clsx from "clsx";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  createProject,
  fetchProject,
  updateProject,
  uploadToStorage,
  upsertFinancing,
  upsertTeamMembers,
} from "@/app/api/sdk";
import { Tables } from "@/types/database.types";
import { Project } from "@/app/api/projects/route";
import { TeamMember } from "@/app/api/project/[projectId]/team/route";

interface LaunchFormProps {
  onSubmit: (data: Omit<Project, "id" | "created_at">) => void;
  isSubmitting: boolean;
  initialProject?: Project;
}

const DEBUG = process.env.NODE_ENV !== "production";
const debug = (...args: any[]) => DEBUG && console.log(...args);

export default function LaunchForm({
  onSubmit,
  isSubmitting,
  initialProject,
}: LaunchFormProps): ReactElement {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = React.useRef<HTMLFormElement>(null);
  const [characterCount, setCharacterCount] = useState(0);
  const { user } = usePrivy();
  const { wallets } = useWallets();
  // Use the first wallet, matching WalletSettings logic
  const walletAddress = wallets && wallets.length > 0 ? wallets[0].address : "";
  const [showWarning, setShowWarning] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return (
      window.localStorage.getItem("superfan_user_agreement_ack") !== "true"
    );
  });
  const [showPendingModal, setShowPendingModal] = useState(false);
  const { toast } = useToast();
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [formData, setFormData] = useState<
    Omit<Project, "id" | "createdAt"> & {
      id?: string;
      endDate: string;
      financingEnabled?: boolean;
    }
  >({
    title: "",
    artist_name: "",
    description: "",
    releaseDate: "",
    fileUrl: "",
    cover_art_url: "",
    track_demo_url: "",
    completed: false,
    fundingSettings: {
      platformFee: 2.5,
      curatorSupport: false,
      backersPercentage: "0",
    },
    team_members:
      initialProject?.team_members ||
      [
        // {
        //   id: crypto.randomUUID(),
        //   role: "Artist",
        //   name: "",
        //   email: "",
        //   wallet_address: "",
        //   revenue_share_pct: 50,
        //   copyright_type: "both", // Artists typically own both recording and songwriting
        // } as TeamMember, // TODO: types
        // {
        //   id: crypto.randomUUID(),
        //   role: "Producer",
        //   name: "",
        //   email: "",
        //   wallet_address: "",
        //   revenue_share_pct: 50,
        //   copyright_type: "sound_recording", // Producers typically own recording rights
        //   deal_type: "indie",
        // } as TeamMember, // TODO: types
      ],
    financing: {
      target_raise: null,
      end_date: "",
    },
    financingEnabled: undefined,
    creatorwalletaddress: "",
  });

  const artworkInputRef = React.useRef<HTMLInputElement>(null);
  const demoInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingArtwork, setUploadingArtwork] = useState(false);
  const [uploadingDemo, setUploadingDemo] = useState(false);

  const handleWarningAcknowledge = (open: boolean) => {
    if (!open) {
      window.localStorage.setItem("superfan_user_agreement_ack", "true");
      setShowWarning(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === "description") {
      setCharacterCount(value.length);
    }

    // Clear error when field is edited
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleProjectInfoNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      const creatorId = user?.id;
      if (!creatorId) {
        setErrors((prev) => ({ ...prev, creator: "User not authenticated." }));
        return;
      }
      let project: any;
      let projectError: any;

      const projectData = {
        creator_id: creatorId,
        title: formData.title,
        artist_name: formData.artist_name,
        description: formData.description || "",
        status: "draft",
        creatorwalletaddress:
          formData.creatorwalletaddress || (wallets?.[0]?.address ?? ""),
      };

      try {
        if (!formData.id) {
          project = await createProject(projectData);
        } else {
          project = await updateProject(formData.id, projectData);
        }
        setFormData((prev) => ({ ...prev, id: project.id }));
        setCurrentStep(3);
        window.scrollTo(0, 0);
      } catch (error: any) {
        projectError = error;
      }

      if (projectError || !project) {
        setErrors((prev) => ({
          ...prev,
          supabase:
            projectError?.message || "Failed to create/update project draft.",
        }));
        return;
      }
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        draft: err.message || "Failed to create/update project draft.",
      }));
    }
  };

  // const [fundingSettings, setFundingSettings] = useState<FundingSettings>({
  //   platformFee: 2.5,
  //   curatorSupport: false,
  //   backersPercentage: "0",
  // });

  // const handleTeamSplitsSave = async () => {
  //   if (!formData.id) {
  //     setErrors((prev) => ({
  //       ...prev,
  //       team: "Project ID missing. Please complete Step 1 first.",
  //     }));
  //     return;
  //   }
  //   try {
  //     let teamRows = formData.team_members.map((member) => ({
  //       id: member.id,
  //       project_id: formData.id,
  //       role: member.role,
  //       name: member.name,
  //       email: member.email,
  //       wallet_address: member.wallet_address || null,
  //       revenue_share_pct: member.revenue_share_pct,
  //       copyright_type:
  //         member.role === "Producer"
  //           ? "both"
  //           : ["Songwriter", "Composer", "Lyricist"].includes(member.role!)
  //           ? "composition"
  //           : "sound_recording",
  //       deal_type: member.role === "Producer" ? "indie" : null,
  //     }));

  //     // Use unique IDs for deduplication instead of wallet addresses (since they might be null)
  //     const uniqueTeamRows = teamRows.filter(
  //       (row, index, self) =>
  //         index ===
  //         self.findIndex(
  //           (r) =>
  //             r.role === row.role &&
  //             r.name === row.name &&
  //             r.project_id === row.project_id
  //         )
  //     );

  //     console.log({
  //       uniqueTeamRows
  //     })

  //     await upsertTeamMembers(formData.id, uniqueTeamRows);
  //     setCurrentStep(3);
  //     window.scrollTo(0, 0);
  //   } catch (err: any) {
  //     setErrors((prev) => ({
  //       ...prev,
  //       team: err.message || "Failed to save team members.",
  //     }));
  //   }
  // };

  const handleFinancingSave = (data: {
    teamMembers: TeamMember[];
    target_raise: number | null | string;
    endDate: string;
  }) => {
    // Ensure target_raise is always a number or null
    let target_raiseNum = null;
    if (
      typeof data.target_raise === "string" &&
      data.target_raise.trim() !== ""
    ) {
      target_raiseNum = Number(data.target_raise);
      if (isNaN(target_raiseNum)) target_raiseNum = null;
    } else if (typeof data.target_raise === "number") {
      target_raiseNum = data.target_raise;
    }
    setFormData((prev) => ({
      ...prev,
      // team_members: data.teamMembers,
      financing: {
        target_raise: target_raiseNum,
        end_date: data.endDate,
      },
    }));
    setCurrentStep(4);
    window.scrollTo(0, 0);
  };

  const handleSaveDraft = async () => {
    setErrors({});
    setIsSavingDraft(true);
    try {
      const creatorId = user?.id;
      if (!creatorId) {
        setErrors((prev) => ({ ...prev, creator: "User not authenticated." }));
        setIsSavingDraft(false);
        return;
      }

      const projectData = {
        creator_id: creatorId,
        title: formData.title,
        artist_name: formData.artist_name,
        description: formData.description || "",
        status: "draft",
        creatorwalletaddress:
          formData.creatorwalletaddress || (wallets?.[0]?.address ?? ""),
        cover_art_url: formData.cover_art_url,
        track_demo_url: formData.track_demo_url,
      };

      let project: Tables<"projects">;
      try {
        if (!formData.id) {
          project = await createProject(projectData);
          setFormData((prev) => ({ ...prev, id: project.id }));
        } else {
          project = await updateProject(formData.id, projectData);
        }

        // Save team members if available
        // if (
        //   formData.team_members &&
        //   formData.team_members.length > 0 &&
        //   project.id
        // ) {
        //   const teamRows = formData.team_members.map((member) => ({
        //     id: member.id,
        //     project_id: project.id,
        //     role: member.role,
        //     name: member.name,
        //     email: member.email,
        //     wallet_address: member.wallet_address,
        //     revenue_share_pct: member.revenue_share_pct,
        //   }));

        //   await upsertTeamMembers(project.id, teamRows);
        // }

        // Insert financing if available
        if (formData.financing?.target_raise) {
          await upsertFinancing(project.id, {
            enabled: true,
            target_raise: formData.financing.target_raise,
            end_date: formData.financing.end_date,
          });
          await updateProject(project.id, { early_curator_shares: true });
        }

        toast({
          title: "Draft saved!",
          description: "You can resume editing from your dashboard.",
        });
        router.push("/");
      } catch (error: any) {
        setErrors((prev) => ({
          ...prev,
          draft: error.message || "Failed to save draft.",
        }));
        toast({
          title: "Failed to save draft",
          description: error.message || "Please try again.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        draft: err.message || "Failed to save draft.",
      }));
      toast({
        title: "Failed to save draft",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setErrors({});
    try {
      debug("Form data at publish:", formData);
      // 1. Get Privy DID for creator_id
      const creatorId = user?.id;
      if (!creatorId) {
        debug("Early return: not authenticated");
        setErrors((prev) => ({ ...prev, creator: "User not authenticated." }));
        setIsPublishing(false);
        return;
      }
      // Early exit if no draft project id
      if (!formData.id) {
        debug("Early return: no draft project id");
        setErrors((prev) => ({
          ...prev,
          publish: "Project draft missing. Please complete Step 1 first.",
        }));
        setIsPublishing(false);
        return;
      }

      // // 2. Revenue Share Validation
      // const teamMembers = formData.team_members ?? [];
      // const sumShares = teamMembers.reduce(
      //   (sum, m) =>
      //     sum +
      //     (typeof m.revenue_share_pct === "number" ? m.revenue_share_pct : 0),
      //   0
      // );
      // if (sumShares > 100) {
      //   debug("Early return: revenue share sum exceeds 100%", { sumShares });
      //   setErrors((prev) => ({
      //     ...prev,
      //     revenue: `Team member shares cannot exceed 100%. Currently: ${sumShares}%.`,
      //   }));
      //   return;
      // }

      // // Require all collaborators (not the creator) with revenueShare > 0 to have a wallet address
      // const missingWallets = teamMembers.filter(
      //   (m) => (m.revenue_share_pct || 0) > 0 && !m.wallet_address
      // );
      // if (missingWallets.length > 0) {
      //   debug(
      //     "Early return: missing collaborator wallet addresses",
      //     missingWallets
      //   );
      //   setErrors((prev) => ({
      //     ...prev,
      //     team: "All collaborators must provixde a wallet address before publishing.",
      //   }));
      //   return;
      // }

      const project = await fetchProject(formData.id);
      if (!project) {
        debug("Early return: failed to fetch project draft");
        setErrors((prev) => ({
          ...prev,
          supabase: "Failed to fetch project draft.",
        }));
        return;
      }

      // 4. Upload files to storage using real project ID
      let coverArtUrl = formData.cover_art_url;
      let track_demo_url = formData.track_demo_url;
      if (
        formData.cover_art_url &&
        formData.cover_art_url.startsWith("http") === false &&
        artworkInputRef.current?.files?.[0]
      ) {
        debug("Uploading artwork to storage");
        coverArtUrl = await uploadToStorage(
          artworkInputRef.current.files[0],
          "cover-art",
          project.id
        );
      }
      if (
        formData.track_demo_url &&
        formData.track_demo_url.startsWith("http") === false &&
        demoInputRef.current?.files?.[0]
      ) {
        debug("Uploading demo to storage");
        track_demo_url = await uploadToStorage(
          demoInputRef.current.files[0],
          "track-demo",
          project.id
        );
      }

      debug("Updating project with file URLs and status");
      await updateProject(project.id, {
        cover_art_url: coverArtUrl,
        track_demo_url: track_demo_url,
        status: "pending",
      });

      // // 6. Insert team members
      // if (formData.team_members && formData.team_members.length > 0) {
      //   debug("Upserting team members");
      //   const teamRows = formData.team_members.map((member) => ({
      //     id: member.id,
      //     project_id: project.id,
      //     role: member.role,
      //     name: member.name,
      //     email: member.email,
      //     wallet_address: member.wallet_address,
      //     revenue_share_pct: member.revenue_share_pct,
      //   }));
      //   await upsertTeamMembers(project.id, teamRows);
      // }

      // 7. Insert financing if target_raise and endDate are set
      debug("Financing upsert input:", {
        project_id: formData.id,
        target_raise: formData.financing?.target_raise,
        endDate: formData.endDate,
      });
      if (formData.financing?.target_raise) {
        await upsertFinancing(formData.id, {
          enabled: true,
          target_raise: formData.financing.target_raise,
          end_date: formData.financing.end_date,
        });
        await updateProject(project.id, {
          early_curator_shares: true,
        });
      }

      // Optionally, call onSubmit or redirect
      debug("Calling onSubmit");
      setShowPendingModal(true);
    } catch (err: any) {
      debug("Error in handlePublish:", err);
      setErrors((prev) => ({
        ...prev,
        publish: err.message || "Failed to publish project.",
      }));
    } finally {
      setIsPublishing(false);
    }
  };

  // Replace handleArtworkUpload
  const handleArtworkUpload = () => {
    artworkInputRef.current?.click();
  };

  const onArtworkFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingArtwork(true);
    try {
      // Use a temp id for draft uploads (can be replaced with real project id after creation)
      const tempProjectId = formData.title || crypto.randomUUID();
      const url = await uploadToStorage(file, "cover-art", tempProjectId);
      setFormData((prev) => ({ ...prev, cover_art_url: url }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        cover_art_url: "Failed to upload artwork.",
      }));
    } finally {
      setUploadingArtwork(false);
    }
  };

  // Replace handleDemoUpload
  const handleDemoUpload = () => {
    demoInputRef.current?.click();
  };

  const onDemoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDemo(true);
    try {
      const tempProjectId = formData.title || crypto.randomUUID();
      const url = await uploadToStorage(file, "track-demo", tempProjectId);
      setFormData((prev) => ({ ...prev, track_demo_url: url }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        track_demo_url: "Failed to upload demo.",
      }));
    } finally {
      setUploadingDemo(false);
    }
  };

  const removeArtwork = () => {
    setFormData((prev) => ({ ...prev, cover_art_url: "" }));
  };

  const removeDemo = () => {
    setFormData((prev) => ({ ...prev, track_demo_url: "" }));
  };

  // Handle progress bar clicks
  const handleProgressClick = (step: number) => {
    setCurrentStep(step);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (!initialProject) return;
    setFormData((prev) => ({
      ...prev,
      ...initialProject,
    }));
  }, [initialProject]);

  // const { data: teamMembersData } = useTeamMembers(initialProject?.id || null);
  // useEffect(() => {
  //   if (teamMembersData && teamMembersData.length > 0) {
  //     const loadedMembers = teamMembersData.map((member) => ({
  //       ...member,
  //       // Add new fields with defaults for existing data
  //       copyright_type:
  //         member.copyright_type ||
  //         (member.role === "Producer"
  //           ? "both"
  //           : ["Songwriter", "Composer", "Lyricist"].includes(member.role!)
  //           ? "composition"
  //           : "sound_recording"),
  //       deal_type: member.deal_type || "indie",
  //     }));
  //     setTeamMembers(loadedMembers);
  //     setFormData((prev) => ({ ...prev, teamMembers: loadedMembers }));
  //   }
  // }, [teamMembersData]);

  return (
    <>
      <UserAgreementWarning
        isOpen={showWarning}
        onOpenChange={handleWarningAcknowledge}
      />
      <div
        aria-hidden={showWarning}
        inert={showWarning ? true : undefined}
        className={clsx(
          showWarning && "pointer-events-none opacity-50 select-none"
        )}
      >
        <div className="mb-6 flex justify-center">
          <div className="flex items-center">
            {[1, 3, 4].map((step) => (
              <React.Fragment key={step}>
                <motion.div
                  className={`h-2.5 w-2.5 rounded-full cursor-pointer ${
                    step <= currentStep ? "bg-primary" : "bg-gray-600"
                  }`}
                  onClick={() => handleProgressClick(step)}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                />
                {step < 4 && (
                  <motion.div
                    className={`h-0.5 w-12 ${
                      step < currentStep ? "bg-primary" : "bg-gray-600"
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: "3rem" }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {currentStep === 1 ? (
            <motion.form
              key="step1"
              ref={formRef}
              onSubmit={handleProjectInfoNext}
              className="mx-auto space-y-6 pb-24"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Project Information</h2>
                <p className="text-muted-foreground text-sm">
                  Tell us about your music project.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="title" className="block text-sm font-medium">
                    Project Title
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Give your project a name"
                    className="input-field w-full py-2.5"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="artist_name"
                    className="block text-sm font-medium"
                  >
                    Artist/Creator Name
                  </label>
                  <input
                    type="text"
                    id="artist_name"
                    name="artist_name"
                    value={formData.artist_name}
                    onChange={handleChange}
                    placeholder="Who's leading the charge?"
                    className="input-field w-full py-2.5"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium"
                  >
                    Short Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description || ""}
                    onChange={handleChange}
                    placeholder="Tell the story, share the vibe"
                    rows={3}
                    className="input-field w-full"
                  />
                  <div className="flex justify-end">
                    <span className="text-xs text-muted-foreground">
                      {characterCount}/500 characters
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="artworkUpload"
                    className="block text-sm font-medium"
                  >
                    Upload Artwork
                  </label>
                  {formData.cover_art_url ? (
                    <div className="relative overflow-hidden rounded-md border border-border">
                      <img
                        src={formData.cover_art_url || "/placeholder.svg"}
                        alt="Artwork"
                        className="h-40 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={removeArtwork}
                        className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-foreground hover:bg-background"
                      >
                        <span className="sr-only">Remove</span>
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 15 15"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                            fill="currentColor"
                            fillRule="evenodd"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleArtworkUpload}
                      className="flex h-32 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-transparent hover:bg-accent/10"
                    >
                      <ImageIcon className="mb-2 h-6 w-6 text-muted" />
                      <span className="text-sm text-muted-foreground">
                        Upload artwork
                      </span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="demoUpload"
                    className="block text-sm font-medium"
                  >
                    Upload Track Demo (Optional)
                  </label>
                  {formData.track_demo_url ? (
                    <div className="relative flex items-center rounded-md border border-border p-3">
                      <Music className="mr-3 h-6 w-6 text-primary" />
                      <div>
                        <p className="font-medium text-sm">
                          {(() => {
                            try {
                              const url = new URL(formData.track_demo_url);
                              return decodeURIComponent(
                                url.pathname.split("/").pop() || ""
                              );
                            } catch {
                              return formData.track_demo_url;
                            }
                          })()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Demo track
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={removeDemo}
                        className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-foreground hover:bg-background"
                      >
                        <span className="sr-only">Remove</span>
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 15 15"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                            fill="currentColor"
                            fillRule="evenodd"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDemoUpload}
                      className="flex h-32 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-transparent hover:bg-accent/10"
                    >
                      <Music className="mb-2 h-6 w-6 text-muted" />
                      <span className="text-sm text-muted-foreground">
                        Upload demo track
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </motion.form>
          ) : currentStep === 2 ? null : //   animate={{ opacity: 1, x: 0 }} //   initial={{ opacity: 0, x: 20 }} //   key="step2" // <motion.div
          //   exit={{ opacity: 0, x: 20 }}
          //   transition={{ duration: 0.4 }}
          // >
          //   {errors.team && (
          //     <div className="text-red-500 text-sm mb-2">{errors.team}</div>
          //   )}
          //   <TeamSplitsForm
          //     teamMembers={formData.team_members}
          //     setTeamMembers={(team_members) =>
          //       setFormData((d) => ({ ...d, team_members }))
          //     }
          //     onSave={handleTeamSplitsSave}
          //     onBack={() => setCurrentStep(1)}
          //     isSubmitting={isSubmitting}
          //   />
          // </motion.div>
          currentStep === 3 ? (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.4 }}
            >
              {/* Financing form removed - legacy funding feature disabled */}
              <div className="text-center py-8" role="status" aria-live="polite" data-testid="financing-disabled">
                <p className="text-muted-foreground">Financing is currently disabled for new projects.</p>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
                >
                  Skip financing and continue to review
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.4 }}
            >
              <ReviewProject
                project={formData}
                onBack={() => setCurrentStep(3)}
                onPublish={handlePublish}
                isSubmitting={isPublishing}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <input
          type="file"
          accept="image/*"
          ref={artworkInputRef}
          style={{ display: "none" }}
          onChange={onArtworkFileChange}
        />

        <input
          type="file"
          accept="audio/*"
          ref={demoInputRef}
          style={{ display: "none" }}
          onChange={onDemoFileChange}
        />

        {!showWarning && (
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-10 border-t border-[#1E1E32]/20 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="container mx-auto flex items-center justify-between p-4">
              {currentStep === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="rounded-md bg-transparent px-3 py-2 text-sm text-foreground hover:bg-accent/50"
                  >
                    Cancel
                  </button>
                  <Button
                    variant="outline"
                    onClick={handleSaveDraft}
                    className="gap-2 border-secondary-foreground/20 bg-secondary/30 hover:bg-secondary/50 hover:text-secondary-foreground transition-all duration-200 shadow-sm"
                    disabled={isSavingDraft || isPublishing}
                  >
                    <Save className="h-4 w-4 opacity-70" />
                    Save as Draft
                  </Button>
                  <button
                    type="submit"
                    onClick={() => formRef.current?.requestSubmit()}
                    className="rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90"
                  >
                    Continue
                  </button>
                </>
              ) : currentStep === 2 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="rounded-md bg-transparent px-3 py-2 text-sm text-foreground hover:bg-accent/50"
                    disabled={isSavingDraft || isPublishing}
                  >
                    Back
                  </button>
                  <Button
                    variant="outline"
                    onClick={handleSaveDraft}
                    className="gap-2 border-secondary-foreground/20 bg-secondary/30 hover:bg-secondary/50 hover:text-secondary-foreground transition-all duration-200 shadow-sm"
                    disabled={isSavingDraft || isPublishing}
                  >
                    <Save className="h-4 w-4 opacity-70" />
                    Save as Draft
                  </Button>
                </>
              ) : currentStep === 3 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="rounded-md bg-transparent px-3 py-2 text-sm text-foreground hover:bg-accent/50"
                    disabled={isSavingDraft || isPublishing}
                  >
                    Back
                  </button>
                  <Button
                    variant="outline"
                    onClick={handleSaveDraft}
                    className="gap-2 border-secondary-foreground/20 bg-secondary/30 hover:bg-secondary/50 hover:text-secondary-foreground transition-all duration-200 shadow-sm"
                    disabled={isSavingDraft || isPublishing}
                  >
                    <Save className="h-4 w-4 opacity-70" />
                    Save as Draft
                  </Button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="rounded-md bg-transparent px-3 py-2 text-sm text-foreground hover:bg-accent/50"
                    disabled={isSavingDraft || isPublishing}
                  >
                    Back
                  </button>
                  <Button
                    variant="outline"
                    onClick={handleSaveDraft}
                    className="gap-2 border-secondary-foreground/20 bg-secondary/30 hover:bg-secondary/50 hover:text-secondary-foreground transition-all duration-200 shadow-sm"
                    disabled={isSavingDraft || isPublishing}
                  >
                    <Save className="h-4 w-4 opacity-70" />
                    Save as Draft
                  </Button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    className="rounded-md bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90"
                    disabled={isSavingDraft || isPublishing}
                  >
                    {isPublishing ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                        <span>Publishing...</span>
                      </div>
                    ) : (
                      <span>⚡ Publish</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>
      {/* Pending Approval Modal */}
      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-background rounded-xl p-8 max-w-md w-full text-center shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Project Submitted!</h2>
            <p className="mb-6">
              Your project is now{" "}
              <span className="font-semibold text-yellow-500">
                pending approval
              </span>{" "}
              by an admin. You will be notified when it is published.
            </p>
            <button
              className="rounded-md bg-primary px-4 py-2 text-white font-medium hover:bg-primary/90"
              onClick={() => {
                setShowPendingModal(false);
                router.push("/");
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </>
  );
}
