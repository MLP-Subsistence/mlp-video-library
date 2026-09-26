/**
 * Shared Educator Studio types. These are plain data shapes that cross the
 * server/client boundary, so they must stay free of Prisma or Node imports.
 */

export type AssetKind = "image" | "video" | "audio";

export type SlotFit = "cover" | "contain";

export type CompositionItem = {
  assetId: string;
  /** Proportion of the segment duration this item occupies inside its slot (sequential items). */
  share: number;
  /** For video assets: where inside the clip playback starts (seconds). Lets a master video be reused per segment. */
  startSec?: number;
};

export type CompositionSlot = {
  id: string;
  fit: SlotFit;
  items: CompositionItem[];
};

export type Composition = {
  layout: string;
  slots: CompositionSlot[];
  textOverlay?: TextOverlay;
};

export type TextFont = "Arial" | "Georgia" | "Verdana" | "Trebuchet MS" | "Tahoma" | "Times New Roman" | "Courier New" | "Impact" | "Comic Sans MS";

/**
 * Words drawn over a segment's picture — independent of the narration script.
 * Sizes (fontSize, letterSpacing, radius, stroke, shadow) are in pixels of a
 * 1920x1080 frame and are scaled for the preview and for 720p exports.
 */
export type TextOverlay = {
  text: string;
  /** Normalized to the 16:9 video frame, not the editor's pixel size. */
  x: number;
  y: number;
  w: number;
  h: number;
  fontFamily: TextFont;
  fontSize: number;
  color: string;
  opacity: number;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  bold: boolean;
  italic: boolean;
  underline: boolean;
  uppercase: boolean;
  letterSpacing: number;
  lineHeight: number;
  rotation: number;
  background: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundRadius: number;
  strokeWidth: number;
  strokeColor: string;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowOpacity: number;
};

export type TextStylePreset = {
  id: string;
  label: string;
  description: string;
  style: Partial<TextOverlay>;
};

export type LayoutSlotRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: "rect" | "circle" | "wedge";
  /** Polygon in the slot's own box (0..1), used to cut pie slices out of the media. */
  clip?: Array<[number, number]>;
};

export type LayoutDefinition = {
  id: string;
  label: string;
  description: string;
  slots: LayoutSlotRect[];
};

export type TranslationStatus = "missing" | "draft" | "approved";
export type TranslationSource = "none" | "ai" | "human";
export type NarrationSource = "none" | "record" | "ai" | "upload" | "full";
export type NarrationStatus = "missing" | "ready" | "needs_update" | "needs_review";

export type StudioAssetDto = {
  id: string;
  kind: AssetKind;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  tags: string;
  createdAt: string;
  usedIn?: number;
};

export type StudioAssetFolderDto = {
  id: string;
  title: string;
  assetCount: number;
  thumbnailUrl: string | null;
};

export type SegmentWarning = {
  code:
    | "translation_missing"
    | "translation_draft"
    | "narration_missing"
    | "narration_needs_update"
    | "narration_needs_review"
    | "visual_missing"
    | "video_timing";
  message: string;
};

export type ProjectSegmentDto = {
  /** StudioProjectSegment id */
  id: string;
  /** Master StudioSegment id (stable across localizations) */
  segmentId: string;
  key: string;
  orderIndex: number;
  title: string;
  sourceScript: string;
  translation: string;
  translationStatus: TranslationStatus;
  translationSource: TranslationSource;
  narration: {
    assetId: string | null;
    url: string | null;
    source: NarrationSource;
    startSec: number | null;
    endSec: number | null;
    durationSec: number;
    status: NarrationStatus;
    confidence: number | null;
  };
  pauseBeforeSec: number;
  pauseAfterSec: number;
  pauseIsOverride: boolean;
  /** Where this segment sits inside the original master video, when known. */
  source: { startSec: number; endSec: number } | null;
  composition: Composition;
  /** Master visual before this localization's changes. */
  templateComposition: Composition;
  compositionIsOverride: boolean;
  voiceIdOverride: string | null;
  reviewNote: string | null;
  approvedAt: string | null;
  warnings: SegmentWarning[];
};

export type TimelineBlock = {
  segmentId: string;
  key: string;
  index: number;
  title: string;
  startSec: number;
  pauseBeforeSec: number;
  narrationSec: number;
  pauseSec: number;
  durationSec: number;
  endSec: number;
  items: Array<{ slotId: string; assetId: string; startSec: number; durationSec: number; sourceStartSec: number }>;
};

export type Timeline = {
  totalSec: number;
  blocks: TimelineBlock[];
};

export type ProjectDto = {
  id: string;
  title: string;
  status: string;
  targetLanguageCode: string;
  targetLanguageName: string;
  region: string | null;
  variety: string | null;
  audience: string | null;
  register: string | null;
  glossary: string;
  defaultVoiceId: string | null;
  defaultVoiceName: string | null;
  voiceSettings: VoiceSettings;
  renderQuality: "1080p" | "720p";
  latestRenderJobId: string | null;
  renderedAssetUrl: string | null;
  publishedVideoId: string | null;
  approvedAt: string | null;
  template: {
    id: string;
    title: string;
    sourceLanguageCode: string;
    moduleName: string | null;
    frameWidth: number;
    frameHeight: number;
    fps: number;
    musicAssetId: string | null;
    musicAssetUrl: string | null;
    musicVolume: number;
    /** Original master video (with its English narration) for reference playback. */
    masterAssetUrl: string | null;
  };
  segments: ProjectSegmentDto[];
  assets: Record<string, StudioAssetDto>;
  timeline: Timeline;
  fullNarration: {
    id: string;
    status: string;
    assetUrl: string;
    error: string | null;
    createdAt: string;
  } | null;
  permissions: {
    canManageTemplates: boolean;
    canGenerateVideo: boolean;
    canPublish: boolean;
  };
  credits: {
    limit: number;
    used: number;
    remaining: number;
  };
  updatedAt: string;
};

export type VoiceSettings = {
  stability?: number;
  similarity?: number;
  style?: number;
  speed?: number;
  /** Optional per-project model; falls back to the studio-wide default. */
  model?: string;
  /** Explicit `language_code` sent to the provider; only models that support it use it. */
  languageOverride?: string;
};

export type VoiceOption = {
  id: string;
  name: string;
  description?: string;
  languages?: string[];
  previewUrl?: string | null;
  labels?: Record<string, string>;
  /** "cloned" and "generated" voices belong to the account and can be removed. */
  category?: string;
};

/** A voice from the provider's public library, not yet in the account. */
export type SharedVoiceOption = VoiceOption & { publicOwnerId: string; accent?: string; useCase?: string; gender?: string; age?: string };

export type VoiceModelOption = {
  id: string;
  name: string;
  description?: string;
  /** Credits charged per character, relative to the standard model. */
  costFactor?: number;
  languages?: string[];
  /** Whether this model accepts an explicit language_code override. */
  supportsLanguageOverride?: boolean;
};

/** One generated candidate from Voice Design, not yet saved to the account. */
export type VoiceDesignPreview = {
  previewId: string;
  audioBase64: string;
  durationSec?: number;
};

/** A past narration generation, for the History tab. Text/voice are looked up client-side from what is loaded. */
export type VoiceHistoryEntry = {
  id: string;
  createdAt: string;
  status: string;
  characters: number;
  voiceId: string;
  model: string;
  segmentId: string | null;
  segmentTitle: string | null;
  segmentKey: string | null;
  textSnippet: string | null;
  outputAssetUrl: string | null;
  isRetry: boolean;
};

/** What the provider account allows — shown so nobody has to open the ElevenLabs dashboard. */
export type VoiceAccountStatus = {
  provider: string;
  tier: string | null;
  characterCount: number | null;
  characterLimit: number | null;
  canCloneVoices: boolean;
  voicesUsed: number | null;
  voiceLimit: number | null;
};

export type JobDto = {
  id: string;
  type: string;
  status: string;
  progress: number;
  stage: string | null;
  error: string | null;
  outputAssetUrl: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type ProjectSummaryDto = {
  id: string;
  title: string;
  targetLanguageName: string;
  region: string | null;
  /** The source-library playlist this lesson belongs to. */
  playlistId: string | null;
  playlistTitle: string | null;
  /** Position of the lesson inside its source playlist. */
  playlistOrder: number | null;
  status: string;
  narrationReady: number;
  segmentCount: number;
  updatedAt: string;
  createdByName: string;
};

export type TemplateSummaryDto = {
  id: string;
  title: string;
  moduleName: string | null;
  status: string;
  segmentCount: number;
  thumbnailUrl: string | null;
  languages: string[];
  sourceVideoId: string | null;
  /** Playlist the lesson belongs to (main playlist preferred) and its position there. */
  playlistId: string | null;
  playlistTitle: string | null;
  playlistOrder: number | null;
  updatedAt: string;
};

export type LibraryPlaylistDto = {
  id: string;
  title: string;
  language: string | null;
  languageCode: string | null;
  videoCount: number;
  readyCount: number;
  /** Chosen by the administrator as the main lesson playlist; listed and preselected first. */
  isDefault: boolean;
  videos: Array<{
    id: string;
    title: string;
    category: string;
    resourceFormat: string;
    thumbnailUrl: string;
    duration: string | null;
    hasTranscript: boolean;
    templateId: string | null;
    templateStatus: "ready" | "draft" | null;
    segmentCount: number;
    localizedInto: string[];
  }>;
};
