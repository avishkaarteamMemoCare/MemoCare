import path from 'path';
import multer from 'multer';

// In-memory storage: the controller hands the buffer to storageService,
// which persists it (local disk in dev, S3 in production). Keeps
// StorageService as the single place that knows about file paths/buckets.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB ceiling for video sessions

// Browsers (especially on Windows) often report an empty or generic MIME type
// for perfectly valid recordings like iPhone .MOV files, so fall back to the
// file extension when the reported type isn't audio/* or video/*.
const EXTENSION_MIME: Record<string, string> = {
  // video
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.ts': 'video/mp2t',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.ogv': 'video/ogg',
  '.asf': 'video/x-ms-asf',
  // audio
  '.mp3': 'audio/mpeg',
  '.mp2': 'audio/mpeg',
  '.mpga': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.amr': 'audio/amr',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.aifc': 'audio/aiff',
  '.wma': 'audio/x-ms-wma',
  '.wv': 'audio/wavpack',
  '.caf': 'audio/x-caf',
  '.weba': 'audio/webm',
  '.au': 'audio/basic',
  '.snd': 'audio/basic',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
};

/**
 * Accepts every audio/video file the browser can hand over.
 *
 * Rejecting here (inside multer's fileFilter) aborts the multipart stream, and
 * the browser reports that as "Connection is closed" instead of showing the
 * message. So unknown types are accepted; the upload controller decides the
 * media type from the MIME type or the route.
 */
export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (/^(audio|video)\//.test(file.mimetype)) return cb(null, true);

    const inferred = EXTENSION_MIME[path.extname(file.originalname).toLowerCase()];
    if (inferred) {
      file.mimetype = inferred; // normalise so downstream code sees a real media type
      return cb(null, true);
    }
    // Unknown/blank type (common on Windows): keep it and let the controller
    // treat it as audio or video depending on the endpoint.
    if (!file.mimetype || file.mimetype === 'application/octet-stream') {
      file.mimetype = 'application/octet-stream';
      return cb(null, true);
    }
    cb(null, true);
  },
});
