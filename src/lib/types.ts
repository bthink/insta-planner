export type Account = {
  id: string;
  name: string;
  handle: string;
  slug: string;
  accent: string;
  aiContext: string;
};
export type Media = {
  id: string;
  accountId: string;
  originalName: string;
  storedRelativePath: string;
  thumbnailRelativePath: string | null;
  mediaType: "image" | "video";
  mimeType: string;
  hash: string;
  createdAt: string;
  thumbnailError: string | null;
  planned: number;
  published: number;
};
export type ExportState = {
  postId: string;
  purpose: "queue" | "manual";
  desiredRevision: number;
  exportedRevision: number | null;
  relativePath: string | null;
  status: "pending" | "current" | "cleanup_pending" | "absent" | "error";
  lastError: string | null;
};
export type Post = {
  id: string;
  accountId: string;
  title: string;
  type: "photo" | "carousel" | "reel";
  caption: string;
  internalNotes: string;
  scheduledDate: string | null;
  readiness: "draft" | "ready";
  publicationConfirmedAt: string | null;
  revision: number;
  deleted: number;
  media: Media[];
  exports: ExportState[];
};
export type PostInput = Pick<
  Post,
  | "accountId"
  | "title"
  | "type"
  | "caption"
  | "internalNotes"
  | "scheduledDate"
  | "readiness"
> & { mediaIds: string[]; revision?: number };
export function todayWarsaw(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
export function isOverdue(
  post: Pick<Post, "scheduledDate" | "publicationConfirmedAt">,
  today = todayWarsaw(),
): boolean {
  return (
    !!post.scheduledDate &&
    post.scheduledDate < today &&
    !post.publicationConfirmedAt
  );
}
export function missingParts(post: Pick<Post, "media" | "caption">): string[] {
  return [
    ...(!post.media.length ? ["Brak mediów"] : []),
    ...(!post.caption.trim() ? ["Brak podpisu"] : []),
  ];
}
