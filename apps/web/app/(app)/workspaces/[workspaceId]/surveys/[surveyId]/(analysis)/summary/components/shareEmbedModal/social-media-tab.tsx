"use client";

import { CopyIcon, Share2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { Button } from "@/modules/ui/components/button";

interface SocialMediaTabProps {
  surveyUrl: string;
  surveyTitle: string;
}

export const SocialMediaTab: React.FC<SocialMediaTabProps> = ({ surveyUrl, surveyTitle }) => {
  const { t } = useTranslation();
  const [canShare, setCanShare] = useState(false);
  const [sharing, setSharing] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);

  const copy = async () => {
    if (await copyToClipboard(surveyUrl)) toast.success(t("common.copied_to_clipboard"));
    else toast.error(t("common.failed_to_copy_to_clipboard"));
  };
  const share = async () => {
    setSharing(true);
    try {
      await navigator.share({ title: surveyTitle, url: surveyUrl });
    } catch (error) {
      // Closing the browser's share picker is a cancellation, not a copy request.
      const cancelled =
        typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
      if (!cancelled) await copy();
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-4">
      {canShare && (
        <Button variant="outline" className="bg-white" disabled={sharing} onClick={() => void share()}>
          <Share2Icon />
          {t("workspace.surveys.share.social_media.share_button")}
        </Button>
      )}
      <Button variant="outline" className="bg-white" onClick={() => void copy()}>
        <CopyIcon />
        {t("common.copy_link")}
      </Button>
    </div>
  );
};
