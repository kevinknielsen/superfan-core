"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";
import Logo from "@/components/logo";
import { Mail, Wallet } from "lucide-react";

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const { login, authenticated, ready, user } = usePrivy();

  useEffect(() => {
    if (ready && authenticated) {
      router.push(redirect);
    }
  }, [ready, authenticated, router, redirect]);

  const handleLogin = () => {
    login();
  };

  return (
    <div className="min-h-screen">
      <motion.main
        className="flex min-h-screen flex-col items-center justify-center p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Logo className="h-12 w-auto" />
        </motion.div>

        <motion.div
          className="w-full max-w-md space-y-8 rounded-md bg-[#0F141E] p-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="text-center">
            <h1 className="mb-6 text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Back The Music<br />You Love
            </h1>
            <p className="text-xl font-medium text-muted-foreground">
              Welcome to Superfan
            </p>
          </div>

          {!ready ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
              <p>Loading...</p>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
                <button
                  onClick={handleLogin}
                  className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-center"
                  disabled={!ready}
                >
                  <Mail className="h-5 w-5" />
                  <span>Log In</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>


      </motion.main>
    </div>
  );
}
