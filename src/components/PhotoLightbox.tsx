"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { Media } from "@/lib/types";

export default function PhotoLightbox({
  photos,
  selectedId,
  onSelect,
  onClose,
}: {
  photos: Media[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const index = photos.findIndex((photo) => photo.id === selectedId);
  const photo = photos[index];
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, []);
  const move = (delta: number) =>
    onSelect(photos[(index + delta + photos.length) % photos.length].id);

  return (
    <dialog
      ref={dialog}
      className="photo-lightbox"
      aria-label="Podgląd zdjęcia"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <button
        type="button"
        className="lightbox-close"
        aria-label="Zamknij podgląd zdjęcia"
        onClick={onClose}
        autoFocus
      >
        <X />
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          className="lightbox-previous"
          aria-label="Poprzednie zdjęcie"
          onClick={() => move(-1)}
        >
          <ArrowLeft />
        </button>
      )}
      {photo && (
        <figure>
          <img src={`/api/media/${photo.id}`} alt={photo.originalName} />
          <figcaption aria-live="polite">
            {photo.originalName} · {index + 1}/{photos.length}
          </figcaption>
        </figure>
      )}
      {photos.length > 1 && (
        <button
          type="button"
          className="lightbox-next"
          aria-label="Następne zdjęcie"
          onClick={() => move(1)}
        >
          <ArrowRight />
        </button>
      )}
    </dialog>
  );
}
