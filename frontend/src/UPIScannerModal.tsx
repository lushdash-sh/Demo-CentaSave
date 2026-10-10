import React, { useState, useEffect } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Camera, ArrowRight, X } from "lucide-react";

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteSweep: (merchant: string, spend: number) => Promise<void>;
}

export function UPIScannerModal({ isOpen, onClose, onExecuteSweep }: QRModalProps) {
  const [scannedData, setScannedData] = useState<{ pa: string; pn: string } | null>(null);
  const [spendAmount, setSpendAmount] = useState<string>("12");
  const [enableSavings, setEnableSavings] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || scannedData) return;

    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { 
        fps: 10, 
        qrbox: { width: 220, height: 220 },
        videoConstraints: { facingMode: { ideal: "environment" } }
      },
      false
    );

    scanner.render(
      (decodedText) => {
        try {
          if (decodedText.startsWith("upi://pay")) {
            const url = new URL(decodedText);
            const pa = url.searchParams.get("pa") || "merchant@upi";
            const pn = url.searchParams.get("pn") || "Tapri Chai";
            const am = url.searchParams.get("am");
            if (am) setSpendAmount(am);
            setScannedData({ pa, pn });
            scanner.clear();
          } else {
            setScannedData({ pa: "tapri@upi", pn: decodedText.slice(0, 16) });
            scanner.clear();
          }
        } catch {
          setScannedData({ pa: "tapri@upi", pn: "Pune Merchant" });
          scanner.clear();
        }
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [isOpen, scannedData]);

  if (!isOpen) return null;

  const spend = Number(spendAmount) || 0;
  const roundMultiple = spend <= 25 ? 5 : 10;
  const delta = spend % roundMultiple === 0 ? 0 : roundMultiple - (spend % roundMultiple);

  const handleProceed = async () => {
    if (!scannedData) return;

    const spendNum = Number(spendAmount) || 12;

    if (enableSavings && delta > 0) {
      await onExecuteSweep(scannedData.pn, spendNum);
    }

    const upiUri = `upi://pay?pa=${scannedData.pa}&pn=${encodeURIComponent(scannedData.pn)}&am=${spendNum}&cu=INR`;
    window.location.href = upiUri;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#181726] border border-[#2A2845] rounded-2xl max-w-sm w-full p-5 text-white shadow-2xl">
        <div className="flex justify-between items-center pb-3 border-b border-[#2A2845]">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#836EF9]" />
            <h3 className="font-semibold text-base">Scan Merchant UPI QR</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {!scannedData ? (
          <div className="mt-4">
            <div id="qr-reader" className="w-full rounded-xl overflow-hidden border border-[#2A2845]"></div>
            <p className="text-xs text-gray-400 text-center mt-3">
              Point your camera at any UPI QR code
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="bg-[#0F0E17] p-3 rounded-xl border border-[#2A2845]">
              <div className="text-xs text-gray-400">Merchant:</div>
              <div className="font-bold text-sm text-white">{scannedData.pn}</div>
              <div className="text-[11px] font-mono text-[#836EF9]">{scannedData.pa}</div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Spend Amount (₹)</label>
              <input
                type="number"
                value={spendAmount}
                onChange={(e) => setSpendAmount(e.target.value)}
                className="w-full bg-[#0F0E17] border border-[#2A2845] rounded-xl px-3 py-2 text-base font-bold text-white focus:outline-none focus:border-[#836EF9]"
              />
            </div>

            <div className="p-3 bg-[#836EF9]/10 border border-[#836EF9]/30 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-gray-300 block">Monad Micro-Roundup:</span>
                <span className="text-emerald-400 font-bold text-sm">+₹{delta} to Vault</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableSavings}
                  onChange={(e) => setEnableSavings(e.target.checked)}
                  className="w-4 h-4 rounded text-[#836EF9]"
                />
                <span className="text-xs text-gray-300">Save</span>
              </label>
            </div>

            <button
              onClick={handleProceed}
              className="w-full py-2.5 bg-[#836EF9] hover:bg-[#6B52ED] font-semibold rounded-xl text-white flex items-center justify-center gap-2"
            >
              Pay via UPI & Sweep
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}