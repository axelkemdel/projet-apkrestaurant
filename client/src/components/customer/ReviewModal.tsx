import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";

const LABELS = ["portal.review.rating1", "portal.review.rating2", "portal.review.rating3", "portal.review.rating4", "portal.review.rating5"] as const;

/** Évaluation du repas / service : 1 à 5 étoiles et commentaire facultatif. */
export function ReviewModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(0);
      setComment("");
    }
  }, [open]);

  async function submit() {
    if (!rating) return;
    setSending(true);
    try {
      await onSubmit(rating, comment.trim());
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("portal.review.title")}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="min-h-12 rounded-xl px-4 font-semibold text-slate-500 hover:bg-slate-100">
            {t("portal.review.later")}
          </button>
          <button
            onClick={() => void submit()}
            disabled={!rating || sending}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {sending && <Loader2 size={18} className="animate-spin" />}
            {t("portal.review.submit")}
          </button>
        </div>
      }
    >
      <p className="text-center text-slate-600">{t("portal.review.question")}</p>
      <div className="mt-4 flex justify-center gap-1" role="radiogroup" aria-label={t("portal.review.question")}>
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i}
            aria-label={t("portal.review.star", { count: i })}
            whileTap={{ scale: 0.85 }}
            animate={{ scale: i <= rating ? 1.08 : 1 }}
            onClick={() => setRating(i)}
            className="flex h-14 w-14 items-center justify-center rounded-full"
          >
            <Star size={36} className={i <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
          </motion.button>
        ))}
      </div>
      <p className="mt-1 h-6 text-center font-semibold text-amber-600">{rating ? t(LABELS[rating - 1]) : ""}</p>
      <label htmlFor="review-comment" className="mt-4 block text-sm font-medium text-slate-700">
        {t("portal.review.comment")}
      </label>
      <textarea
        id="review-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder={t("portal.review.commentPlaceholder")}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
      />
    </Modal>
  );
}
