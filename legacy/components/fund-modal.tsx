"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet } from "lucide-react";
import type { Project } from "@/app/api/projects/route";
import { useToast } from "@/hooks/use-toast";
import { usePrivy } from "@/lib/auth-context";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import QRCode from "react-qr-code";
import dynamic from "next/dynamic";
import { useFundWallet } from "@privy-io/react-auth";
import { createContribution } from "@/app/api/sdk";
import { useMetalHolder } from "@/hooks/use-metal-holder";
import { useQueryClient } from "@tanstack/react-query";
import { useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address, parseUnits } from "viem";
import { TokenReceivingIndicator } from "./ui/token-receiving-indicator";
import { FundingConditionNotice } from "./ui/funding-condition-notice";
import { usePresale } from "@/hooks/use-presale";

// ERC20 ABI for USDC transfer
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
] as const;

const MoonPayProvider = dynamic(
  () => import("@moonpay/moonpay-react").then((mod) => mod.MoonPayProvider),
  { ssr: false }
);
const MoonPayBuyWidget = dynamic(
  () => import("@moonpay/moonpay-react").then((mod) => mod.MoonPayBuyWidget),
  { ssr: false }
);

interface FundModalProps {
  project: Project | null;
  onClose: () => void;
  isOpen: boolean;
}

export default function FundModal({
  project,
  onClose,
  isOpen,
}: FundModalProps) {
  const { toast } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState<
    "coinbase" | "eth" | "moonpay"
  >("coinbase");
  const [showEthModal, setShowEthModal] = useState(false);
  const [showMoonPay, setShowMoonPay] = useState(false);
  const [isConditionExpanded, setIsConditionExpanded] = useState(false);
  const { user: privyUser } = usePrivy();
  const { user: unifiedUser, walletAddress: unifiedWalletAddress, isInWalletApp } = useUnifiedAuth();
  const { fundWallet } = useFundWallet();

  // Use unified user for Wallet App context, fall back to Privy user for web
  const user = unifiedUser || privyUser;

  // Get presale data for ticker information
  const { data: presaleData } = usePresale(project?.presale_id);

  // Wagmi hooks for USDC transfer
  const { writeContract, data: transferHash, isPending: isTransferPending, error: transferError } = useWriteContract();
  const { isLoading: isTransferConfirming, isSuccess: isTransferSuccess, error: receiptError } = useWaitForTransactionReceipt({
    hash: transferHash,
  });

  // Transaction state management
  const [transactionStage, setTransactionStage] = useState<'idle' | 'initiating' | 'confirming' | 'processing' | 'complete'>('idle');

  // Handle transaction flow with useEffect
  useEffect(() => {
    if (transactionStage === 'idle') return;

    const handleTransactionFlow = async () => {
      try {
        if (transactionStage === 'initiating' && transferHash) {
          console.log("[FundModal] Transfer hash received:", transferHash);
          setFundingMessage("Confirming transfer...");
          setTransactionStage('confirming');
        }

        if (transactionStage === 'confirming' && isTransferSuccess) {
          console.log("[FundModal] USDC transfer confirmed");
          setFundingMessage("Processing presale purchase...");
          setTransactionStage('processing');
          
          // Small delay to ensure Metal API can detect the transferred funds
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Now proceed with the presale purchase
          await proceedWithPresalePurchase();
          setTransactionStage('complete');
        }

        // Handle transaction errors
        if (transferError || receiptError) {
          const errorMessage = transferError?.message || receiptError?.message || 'Transaction failed';
          console.error("[FundModal] Transaction error:", errorMessage);
          setFundingStatus("error");
          setFundingMessage(`Transfer failed: ${errorMessage}`);
          setTransactionStage('idle');
        }
      } catch (error) {
        console.error("[FundModal] Transaction flow error:", error);
        setFundingStatus("error");
        setFundingMessage(error instanceof Error ? error.message : "Transaction failed");
        setTransactionStage('idle');
      }
    };

    handleTransactionFlow();
  }, [transactionStage, transferHash, isTransferSuccess, transferError, receiptError]);

  // Separate function to handle the presale purchase
  const proceedWithPresalePurchase = async () => {
    if (!user || !project) throw new Error("Missing user or project data");

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount)) throw new Error("Invalid amount");

    const contributionPayload = {
      project_id: project.id,
      amount_usdc: parsedAmount,
    };
    
    console.log("[FundModal] Contribution Payload:", contributionPayload);

    try {
      await createContribution(contributionPayload);
      setFundingStatus("success");
      setFundingMessage("Funding successful!");
      
      setTimeout(() => {
        onClose();
        refetchMetalHolder();
      }, 1500);
    } catch (error) {
      console.error("[FundModal] createContribution error:", error);

      // Check if this is the specific Farcaster wallet limitation
      const isReceiptError =
        error instanceof Error &&
        (error.message.includes("UnsupportedMethodError") ||
          error.message.includes("eth_getTransactionReceipt") ||
          error.message.includes("does not support the requested method"));

      if (isInWalletApp && isReceiptError) {
        // In wallet apps, this error means the transaction was submitted successfully
        // but we can't get the receipt due to wallet app limitations
        console.log("[FundModal] Treating receipt error as success in wallet app");
        setFundingStatus("success");
        setFundingMessage("Funding successful! Transaction submitted.");
        
        setTimeout(() => {
          onClose();
          refetchMetalHolder();
        }, 1500);
      } else {
        // For other errors or in web apps, show the actual error
        toast({
          title: "Failed to record contribution",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
        throw error; // Re-throw to be caught by the calling function
      }
    }
  };

  // Helper function to transfer USDC from connected wallet to Metal holder
  const transferUSDCToMetalHolder = async (amount: number): Promise<void> => {
    if (!unifiedWalletAddress || !metalHolder?.address) {
      throw new Error("Missing wallet addresses for transfer");
    }

    console.log("[FundModal] Transferring USDC:", {
      from: unifiedWalletAddress,
      to: metalHolder.address,
      amount: amount,
    });

    // Convert amount to USDC units (6 decimals)
    const amountInUnits = parseUnits(amount.toString(), 6);

    // Execute the transfer with proper error handling
    try {
      writeContract({
        address: USDC_BASE_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [metalHolder.address as Address, amountInUnits],
      });
    } catch (error) {
      console.error("[FundModal] Failed to initiate transfer:", error);
      throw new Error("Failed to initiate USDC transfer");
    }
  };

  // Reset transaction state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTransactionStage('idle');
    }
  }, [isOpen]);

  console.log("[FundModal] Auth state:", {
    isInWalletApp,
    privyUser: privyUser?.id,
    unifiedUser: unifiedUser?.username || unifiedUser?.id,
    finalUser: user?.id,
  });

  const {
    data: metalHolder,
    refetch: refetchMetalHolder,
    isLoading: metalLoading,
    error: metalError,
  } = useMetalHolder({
    user,
  });

  // USDC contract address on Base
  const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
  
  // Use unified wallet address logic (same as Profile page)
  // For Wallet App: use unified wallet address (from Farcaster/Coinbase)  
  // For Web: use Metal holder address (from Privy embedded wallet)
  const walletAddress = isInWalletApp ? unifiedWalletAddress : metalHolder?.address;
  
  // Guard against undefined wallet addresses during hydration
  const isWalletAddressLoading = isInWalletApp && !unifiedWalletAddress;
  
  // Get USDC balance of the connected wallet (in wallet apps)
  const { data: connectedWalletUsdcBalance } = useBalance({
    address: walletAddress as Address,
    token: USDC_BASE_ADDRESS,
    query: { enabled: !!walletAddress && isInWalletApp }
  });

  // Determine which balance to show (same logic as Profile page):
  // - In wallet apps: show connected wallet's USDC balance (never Metal holder balance)
  // - In web: show Metal holder balance (managed wallet)
  // - Guard against undefined addresses showing as 0 balance
  const usdcBalance = isWalletAddressLoading 
    ? undefined // Don't show balance while wallet address is loading
    : isInWalletApp 
    ? parseFloat(connectedWalletUsdcBalance?.formatted || "0")
    : (metalHolder?.usdcBalance || 0);

  console.log("[FundModal] Balance state:", {
    isInWalletApp,
    walletAddress,
    isWalletAddressLoading,
    metalHolder: metalHolder?.address,
    metalHolderBalance: metalHolder?.usdcBalance,
    connectedWalletBalance: connectedWalletUsdcBalance?.formatted,
    finalBalance: usdcBalance,
    isLoading: metalLoading,
    error: metalError?.message,
  });

  const [fundingStatus, setFundingStatus] = useState<
    null | "pending" | "success" | "error"
  >(null);
  const [fundingMessage, setFundingMessage] = useState<string>("");

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Parse entered amount as USDC for comparison
  const enteredUsdAmount = parseFloat(amount);
  const insufficientBalance =
    !metalLoading && 
    !isWalletAddressLoading && 
    usdcBalance !== undefined && 
    enteredUsdAmount > usdcBalance;

  const canFund =
    !metalLoading &&
    !isWalletAddressLoading &&
    !insufficientBalance &&
    enteredUsdAmount > 0 &&
    metalHolder?.address &&
    project?.presale_id &&
    usdcBalance !== undefined;

  const queryClient = useQueryClient();

  const handleAddFunds = async () => {
    if (!metalHolder?.address) return;

    setFundingStatus("pending");
    
    try {
      if (isInWalletApp) {
        // In wallet app contexts (Farcaster/Coinbase), user should fund from their connected wallet
        // Show instructions instead of forcing Privy on-ramp
        setFundingStatus("error");
        setFundingMessage("Please add funds to your connected wallet and try again");
        return;
      } else {
        // Web context: use Privy on-ramp as before
        await fundWallet(metalHolder.address).then(() => {
          setTimeout(() => {
            refetchMetalHolder();
          }, 1000 * 10);
        });
        setFundingStatus("success");
        setFundingMessage("Top-up initiated");
      }
    } catch (e: any) {
      setFundingStatus("error");
      setFundingMessage(e?.message ?? "Top-up failed");
    }
  };

  // Enhanced funding handler with proper transaction flow
  const handleFundProject = async () => {
    console.log("[FundModal] handleFundProject called");
    if (!canFund || fundingStatus === "pending" || transactionStage !== 'idle') {
      console.log("[FundModal] Cannot fund: canFund:", canFund, "fundingStatus:", fundingStatus, "transactionStage:", transactionStage);
      return;
    }

    setFundingStatus("pending");
    
    try {
      if (!user) throw new Error("User not authenticated");

      const parsedAmount = parseFloat(amount);
      if (!Number.isFinite(parsedAmount)) throw new Error("Invalid amount");

      // Step 1: If in wallet app, transfer USDC from connected wallet to Metal holder
      if (isInWalletApp && unifiedWalletAddress && metalHolder?.address && 
          unifiedWalletAddress.toLowerCase() !== metalHolder.address.toLowerCase()) {
        
        console.log("[FundModal] Initiating USDC transfer from connected wallet to Metal holder");
        setFundingMessage("Transferring funds to presale...");
        setTransactionStage('initiating');
        
        await transferUSDCToMetalHolder(parsedAmount);
        // The useEffect will handle the rest of the flow
      } else {
        // Web context or same address - proceed directly to presale
        setFundingMessage("Processing presale purchase...");
        await proceedWithPresalePurchase();
      }
    } catch (err: any) {
      setFundingStatus("error");
      setFundingMessage(err?.message || "Funding failed");
      setTransactionStage('idle');
      console.error("[FundModal] handleFundProject error:", err);
    }
  };

  // Update button disabled state to account for transaction stages
  const isProcessing = fundingStatus === "pending" || 
                      transactionStage !== 'idle' || 
                      isTransferPending || 
                      isTransferConfirming;

  useEffect(() => {
    setAmount("0");
    setShowDropdown(false);
    setShowEthModal(false);
    setShowMoonPay(false);
    setIsConditionExpanded(false);
    setPaymentMethod("coinbase");
    if (modalRef.current) {
      modalRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  if (!project) return null;

  const handleNumberPress = (num: string) => {
    if (amount === "0" && num !== ".") {
      setAmount(num);
    } else {
      if (num === "." && amount.includes(".")) return;
      setAmount(amount + num);
    }
  };

  const handleBackspace = () => {
    if (amount.length > 1) {
      setAmount(amount.slice(0, -1));
    } else {
      setAmount("0");
    }
  };

  const handleQuickAmount = (value: number) => {
    setAmount(value.toString());
  };

  // When closing the ETH modal, also reset scroll/overflow and ensure Fund Project modal is fully visible
  const handleCloseEthModal = () => {
    setShowEthModal(false);
    if (modalRef.current) {
      modalRef.current.scrollTop = 0;
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              ref={modalRef}
              className="relative w-full max-h-[90vh] overflow-y-auto rounded-t-3xl bg-[#0E0E14] sm:max-w-md sm:rounded-2xl mt-4 sm:mt-0"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#1E1E32]/20 px-4 py-3">
                <button onClick={onClose} className="text-gray-400">
                  <X className="h-5 w-5" />
                </button>
                <div className="font-medium text-white text-lg">
                  Fund Project
                </div>
                <div className="w-5"></div>
              </div>

              {/* Project info */}
              <div className="border-b border-[#1E1E32]/20 px-4 py-3 text-center">
                <div className="font-medium text-white">{project.title}</div>
                
                {/* Token Receiving Indicator */}
                <div className="flex justify-center mt-2 mb-3">
                  <TokenReceivingIndicator 
                    ticker={(presaleData?.tokenInfo as any)?.symbol || (() => {
                      const words = project.title.split(/\s+/).filter(w => w.length > 0);
                      const initials = words.map(w => w[0]).join('').toUpperCase();
                      if (initials.length >= 1) return initials.slice(0, 4);
                      const firstFour = project.title.replace(/\s/g, '').slice(0, 4).toUpperCase();
                      return firstFour.length > 0 ? firstFour : 'TICK';
                    })()}
                    showShimmer={!(presaleData?.tokenInfo as any)?.symbol}
                    onToggleExpand={() => setIsConditionExpanded(!isConditionExpanded)}
                    isExpanded={isConditionExpanded}
                  />
                </div>

                {/* Expandable Funding Condition Notice */}
                <div className="flex justify-center">
                  <FundingConditionNotice 
                    ticker={(presaleData?.tokenInfo as any)?.symbol || (() => {
                      const words = project.title.split(/\s+/).filter(w => w.length > 0);
                      const initials = words.map(w => w[0]).join('').toUpperCase();
                      if (initials.length >= 1) return initials.slice(0, 4);
                      const firstFour = project.title.replace(/\s/g, '').slice(0, 4).toUpperCase();
                      return firstFour.length > 0 ? firstFour : 'TICK';
                    })()}
                    isVisible={isConditionExpanded}
                  />
                </div>

                <p className="text-sm text-gray-400">
                  Goal:{" "}
                  {project.financing?.target_raise
                    ? `$${Number(
                        project.financing.target_raise
                      ).toLocaleString()}`
                    : "N/A"}
                </p>
                {metalLoading ? (
                  <p className="text-sm text-gray-400">
                    Loading wallet balance...
                  </p>
                ) : metalError ? (
                  <div className="text-sm text-red-400 text-center">
                    <p>Error loading balance: {metalError.message}</p>
                    {metalError.message.includes("User not logged in") && (
                      <p className="text-xs mt-1 text-gray-400">
                        Check console for origin configuration details
                      </p>
                    )}
                  </div>
                ) : isWalletAddressLoading ? (
                  <p className="text-sm text-gray-400">
                    Loading wallet balance...
                  </p>
                ) : usdcBalance !== undefined ? (
                  <p className="text-sm text-gray-400">
                    Your Balance: {usdcBalance.toFixed(2)} USDC
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">Setting up wallet...</p>
                )}
              </div>

              {/* Only show the rest if Coinbase Pay is selected */}
              {paymentMethod === "coinbase" && (
                <>
                  {/* Amount input */}
                  <div className="px-4 py-6 text-center">
                    <div className="mb-6 text-6xl font-bold text-white">
                      ${amount}
                    </div>

                    {/* Quick amount buttons */}
                    <div className="mb-8 flex justify-center gap-3">
                      <button
                        className="rounded-full bg-[#131822] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a2130]"
                        onClick={() => handleQuickAmount(5)}
                      >
                        $5
                      </button>
                      <button
                        className="rounded-full bg-[#131822] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a2130]"
                        onClick={() => handleQuickAmount(50)}
                      >
                        $50
                      </button>
                      <button
                        className="rounded-full bg-[#131822] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a2130]"
                        onClick={() => handleQuickAmount(100)}
                      >
                        $100
                      </button>
                      <button
                        className="rounded-full bg-[#131822] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a2130]"
                        onClick={() => handleQuickAmount(500)}
                      >
                        Max
                      </button>
                    </div>

                    {/* Numpad */}
                    <div className="grid grid-cols-3 gap-6">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                          key={num}
                          className="text-2xl font-medium text-white hover:text-primary"
                          onClick={() => handleNumberPress(num.toString())}
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        className="text-2xl font-medium text-white hover:text-primary"
                        onClick={() => handleNumberPress(".")}
                      >
                        .
                      </button>
                      <button
                        className="text-2xl font-medium text-white hover:text-primary"
                        onClick={() => handleNumberPress("0")}
                      >
                        0
                      </button>
                      <button
                        className="text-2xl font-medium text-white hover:text-primary"
                        onClick={handleBackspace}
                      >
                        ←
                      </button>
                    </div>

                    {insufficientBalance && (
                      <div className="mt-6 mb-2 rounded-xl bg-[#1E1E32]/30 p-4 border border-primary/20">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Wallet className="h-5 w-5 text-primary" />
                          <span className="text-primary font-medium">
                            Insufficient Funds.
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">
                          {isInWalletApp 
                            ? "Please add USDC to your connected wallet and try again."
                            : "Click below to add $25 to your account. You can always deposit more in your settings page."
                          }
                        </p>
                      </div>
                    )}
                    <button
                      className="w-full rounded-full bg-primary px-4 py-4 font-semibold text-white text-lg shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary mt-8 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => {
                        if (isProcessing || metalLoading) return;
                        if (insufficientBalance && !isInWalletApp) {
                          handleAddFunds();
                        } else if (!insufficientBalance) {
                          handleFundProject();
                        }
                        // For wallet app with insufficient funds, button is disabled, so this won't be called
                      }}
                      disabled={
                        isProcessing ||
                        metalLoading ||
                        isWalletAddressLoading ||
                        !metalHolder?.address ||
                        enteredUsdAmount <= 0 ||
                        (insufficientBalance && isInWalletApp)
                      }
                    >
                      {metalLoading
                        ? "Setting up wallet..."
                        : isWalletAddressLoading
                        ? "Loading wallet..."
                        : isProcessing
                        ? "Processing..."
                        : insufficientBalance
                        ? isInWalletApp 
                          ? "Insufficient USDC" 
                          : "Add Funds"
                        : "Fund"}
                    </button>
                    {fundingStatus && (
                      <div
                        className={`text-sm font-medium mt-4 mb-2 text-center ${
                          fundingStatus === "error"
                            ? "text-red-500"
                            : fundingStatus === "success"
                            ? "text-green-500"
                            : "text-gray-400"
                        }`}
                      >
                        {fundingMessage}
                      </div>
                    )}
                  </div>
                </>
              )}

              {paymentMethod === "moonpay" && (
                <div className="px-4 py-6 text-center">
                  <div className="mb-6 text-6xl font-bold text-white">
                    ${amount}
                  </div>
                  {metalHolder?.address ? (
                    <MoonPayProvider
                      apiKey={process.env.NEXT_PUBLIC_MOONPAY_API_KEY!}
                      debug
                    >
                      <MoonPayBuyWidget
                        variant="overlay"
                        baseCurrencyCode="usd"
                        baseCurrencyAmount={amount}
                        defaultCurrencyCode="eth"
                        walletAddress={metalHolder?.address}
                        visible={showMoonPay}
                        onClose={async () => {
                          setShowMoonPay(false);
                        }}
                      />
                    </MoonPayProvider>
                  ) : (
                    <div className="text-red-400 text-center">
                      No wallet address available for top-up.
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ETH QR Modal */}
      <AnimatePresence>
        {showEthModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="relative w-full max-w-md mx-auto rounded-2xl bg-[#0E0E14] p-6"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <button
                onClick={handleCloseEthModal}
                className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-col items-center">
                <h2 className="text-xl font-bold text-white mb-2">
                  Send ETH or USDC
                </h2>
                <p className="text-sm text-gray-400 mb-4">
                  on the Base network
                </p>
                {metalHolder?.address ? (
                  <>
                    <div className="bg-white p-4 rounded-xl mb-4">
                      <QRCode value={metalHolder.address} size={180} />
                    </div>
                    <div className="mb-2 font-mono text-white text-center break-all">
                      {`${metalHolder.address.slice(
                        0,
                        6
                      )}...${metalHolder.address.slice(-4)}`}
                      <button
                        className="ml-2 text-primary underline"
                        onClick={() => {
                          navigator.clipboard.writeText(metalHolder.address);
                          toast({
                            title: "Address copied",
                            description: `Copied: ${metalHolder.address}`,
                          });
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mb-4 text-red-400 text-center">
                    No wallet address available for top-up.
                  </div>
                )}
                <div className="text-xs text-gray-400 text-center mb-4">
                  <div>
                    This address can only receive ETH and USDC on the Base
                    network. Don't send assets on any other network or it may be
                    lost.
                  </div>
                  <div className="mt-1">Allow up to 30 sec for processing.</div>
                </div>
                <button
                  className="w-full rounded-xl bg-primary py-3 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 mt-2"
                  onClick={handleCloseEthModal}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
