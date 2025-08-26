"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// MoonPay widget disabled - package removed
// const MoonPayBuyWidget = dynamic(
//   () => import("@moonpay/moonpay-react").then((mod) => mod.MoonPayBuyWidget),
//   { ssr: false },
// );
const MoonPayBuyWidget = () => <div>MoonPay widget disabled</div>;

export default function MoonPayTestPage() {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0E0E14]">
      <h1 className="text-2xl font-bold text-white mb-6">
        MoonPay Widget Test
      </h1>
      <button
        className="mb-6 px-4 py-2 rounded bg-primary text-white font-semibold hover:bg-primary/90"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Hide" : "Show"} MoonPay Widget
      </button>
      <MoonPayBuyWidget
        variant="embedded"
        baseCurrencyCode="usd"
        baseCurrencyAmount="100"
        defaultCurrencyCode="eth"
        visible={visible}
      />
    </div>
  );
}
