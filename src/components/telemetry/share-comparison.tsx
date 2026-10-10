"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, DownloadIcon, SendIcon, Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/client-stores";

interface ShareComparisonProps {
  /** The share image's path without the query, e.g. "/f1/telemetry/qualifying/image". */
  imagePath: string;
  /** e.g. "VER vs LEC · F1 Singapore Grand Prix Qualifying telemetry". */
  text: string;
  /** For the downloaded file, e.g. "singapore-qualifying-ver-lec". */
  fileName: string;
}

type Status = "idle" | "working" | "copied" | "downloaded" | "failed";

/**
 * Share the comparison as it looks right now: the image is made on the server from the page's current query
 * (drivers and picked colours), with a motorsportsinfo.app watermark. Posting on X shares the link, whose
 * preview card is the same image.
 */
export function ShareComparison({ imagePath, text, fileName }: ShareComparisonProps) {
  const [status, setStatus] = useState<Status>("idle");
  // Phones can hand the image straight to the X app (or anything else) through the share sheet.
  const canShareFiles = useHydrated() && canShareImages();

  useEffect(() => {
    if (status === "copied" || status === "downloaded" || status === "failed") {
      const t = setTimeout(() => setStatus("idle"), 2500);
      return () => clearTimeout(t);
    }
  }, [status]);

  const imageUrl = () => `${imagePath}${window.location.search}`;
  const fetchImage = async () => {
    const res = await fetch(imageUrl());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  };

  function download(blob: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function copy() {
    setStatus("working");
    try {
      // The blob is handed over as a promise so Safari still counts this as part of the click.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": fetchImage() })]);
      setStatus("copied");
    } catch {
      // No image clipboard here (some browsers, or permission refused): save the file instead.
      try {
        download(await fetchImage());
        setStatus("downloaded");
      } catch {
        setStatus("failed");
      }
    }
  }

  function postOnX() {
    const intent = new URL("https://x.com/intent/post");
    intent.searchParams.set("text", text);
    intent.searchParams.set("url", window.location.href);
    window.open(intent, "_blank", "noopener,noreferrer");
  }

  async function share() {
    setStatus("working");
    try {
      const file = new File([await fetchImage()], `${fileName}.png`, { type: "image/png" });
      await navigator.share({ files: [file], text, url: window.location.href });
      setStatus("idle");
    } catch (error) {
      // Closing the share sheet is not a failure.
      setStatus(error instanceof DOMException && error.name === "AbortError" ? "idle" : "failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copy} disabled={status === "working"}>
        {status === "copied" ? <CheckIcon aria-hidden /> : status === "downloaded" ? <DownloadIcon aria-hidden /> : <CopyIcon aria-hidden />}
        {status === "copied" ? "Copied" : status === "downloaded" ? "Saved instead" : "Copy image"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={postOnX}>
        <SendIcon aria-hidden />
        Post on X
      </Button>
      {canShareFiles && (
        <Button type="button" variant="outline" size="sm" onClick={share} disabled={status === "working"}>
          <Share2Icon aria-hidden />
          Share
        </Button>
      )}
      <span aria-live="polite" className="text-xs text-muted-foreground">
        {status === "working" ? "Making the image…" : status === "failed" ? "Couldn't make the image. Try again in a moment." : ""}
      </span>
    </div>
  );
}

function canShareImages(): boolean {
  if (typeof navigator.canShare !== "function") return false;
  return navigator.canShare({ files: [new File([new Blob()], "probe.png", { type: "image/png" })] });
}
