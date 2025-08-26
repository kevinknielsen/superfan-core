"use client";

import { useRef, useEffect, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { Copy, X } from "lucide-react";
import type { Project } from "@/types/project";
import { useToast } from "@/hooks/use-toast";

interface TradeModalProps {
  project: Project | null;
  onClose: () => void;
  isOpen: boolean;
}

export default function TradeModal({
  project,
  onClose,
  isOpen,
}: TradeModalProps) {
  const { toast } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState<string>("0");
  const [balance, setBalance] = useState<number>(Math.random() * 10 + 0.5);
  const dragX = useMotionValue(0);
  const dragProgress = useTransform(dragX, [0, 250], [0, 100], {
    clamp: true,
  });
  const dragProgressPercent = useTransform(dragProgress, (x) => `${x}%`);
  const [swipeComplete, setSwipeComplete] = useState(false);

  useEffect(() => {
    dragX.set(0);
    setSwipeComplete(false);
  }, [mode, dragX]);

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

  const handleMaxAmount = () => {
    setAmount(balance.toFixed(2));
  };

  const handleTrade = () => {
    toast({
      title: mode === "buy" ? "Purchase successful" : "Sale successful",
      description: `You ${mode === "buy" ? "bought" : "sold"} $${amount} of ${
        project.title
      }`,
    });
    onClose();
  };

  const handleDragEnd = () => {
    if (dragProgress.get() > 90) {
      setSwipeComplete(true);
      handleTrade();
    } else {
      dragX.set(0);
    }
  };

  const tokenSymbol = project.title
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            ref={modalRef}
            className="relative w-full max-h-[90vh] overflow-y-auto rounded-t-3xl bg-[#0E0E14] sm:max-w-md"
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
              <div className="flex rounded-full bg-[#0F141E] p-1">
                <button
                  className={`rounded-full px-6 py-2 text-sm font-medium ${
                    mode === "buy" ? "bg-[#131822] shadow-sm" : "text-gray-400"
                  }`}
                  onClick={() => setMode("buy")}
                >
                  Buy
                </button>
                <button
                  className={`rounded-full px-6 py-2 text-sm font-medium ${
                    mode === "sell" ? "bg-[#131822] shadow-sm" : "text-gray-400"
                  }`}
                  onClick={() => setMode("sell")}
                >
                  Sell
                </button>
              </div>
              <div className="w-5"></div> {/* Empty div for spacing */}
            </div>

            {/* Token info */}
            <div className="border-b border-[#1E1E32]/20 px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="font-medium text-white">{tokenSymbol}</span>
                <button className="text-gray-400">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-gray-400">
                Balance: ${balance.toFixed(2)}
              </p>
            </div>

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
                  onClick={handleMaxAmount}
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
            </div>

            {/* Swipe to buy/sell button */}
            <div className="border-t border-[#1E1E32]/20 p-4">
              <div className="relative h-14 w-full overflow-hidden rounded-full bg-[#181C23]">
                {/* Progress bar */}
                <motion.div
                  className="absolute inset-0 bg-primary"
                  style={{ width: dragProgressPercent }}
                />
                {/* Track text */}
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <span className="font-semibold text-white">
                    Swipe to {mode === "buy" ? "Buy" : "Sell"}
                  </span>
                </div>
                {/* Swipe handle */}
                <motion.div
                  drag="x"
                  dragConstraints={{ left: 0, right: 250 }}
                  dragElastic={0.1}
                  dragMomentum={false}
                  style={{ x: dragX }}
                  onDragEnd={handleDragEnd}
                  className="absolute left-0 top-0 flex h-full w-14 items-center justify-center z-20"
                >
                  <div className="h-12 w-12 rounded-full bg-[#0E0E14] border-2 border-primary flex items-center justify-center shadow-lg" />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
