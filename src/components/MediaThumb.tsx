import { ImageIcon, Film } from "lucide-react";
import type { Media } from "@/lib/types";
export default function MediaThumb({ medium }: { medium?: Media }) {
  return (
    <div className="media-thumb">
      {medium?.thumbnailRelativePath ? (
        <img
          src={`/api/media/${medium.id}/thumbnail`}
          alt={medium.originalName}
          loading="lazy"
        />
      ) : medium?.mediaType === "video" ? (
        <Film size={28} />
      ) : (
        <ImageIcon size={28} />
      )}
      {medium?.mediaType === "video" && (
        <span className="video-mark">
          <Film size={12} /> Rolka
        </span>
      )}
    </div>
  );
}
