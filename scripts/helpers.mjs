import { CONST } from './config.mjs';

/**
 * Utility helper functions
 */

/**
 * Canonicalize text into a slug ID (lowercased, non-alpha replaced with dashes)
 * @param {string} text - Source text
 * @returns {string} Canonicalized ID
 */
export function canonicalizeId(text) {
  if (!text) return '';
  let str = text;
  if (str.startsWith('VGMusic.Mood.')) {
    str = str.replace('VGMusic.Mood.', '');
  } else if (str.startsWith('VGMusic.')) {
    str = str.replace('VGMusic.', '');
  }
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Get the first available GM user
 * @returns {object|null} First active GM user
 */
export function getFirstAvailableGM() {
  return game.users.filter((user) => user.isGM && user.active).sort((a, b) => a.id.localeCompare(b.id))[0] || null;
}

/**
 * Check if current user is the head GM
 * @returns {boolean} True if current user is head GM
 */
export function isHeadGM() {
  return game.user === getFirstAvailableGM();
}

/**
 * Get property from object using dot notation
 * @param {object} object - Source object
 * @param {string} path - Dot notation path
 * @returns {*} Property value
 */
export function getProperty(object, path) {
  return foundry.utils.getProperty(object, path);
}

/**
 * Set property on object using dot notation
 * @param {object} object - Target object
 * @param {string} path - Dot notation path
 * @param {*} value - Value to set
 * @returns {boolean} Whether the property was set
 */
export function setProperty(object, path, value) {
  return foundry.utils.setProperty(object, path, value);
}

/**
 * Identify the VGMusic document category for a given entity
 * @param {Document|object} doc - The document to identify
 * @returns {'Document'|'PrototypeToken'|'DefaultMusic'|null}
 */
export function getDocumentCategory(doc) {
  if (!doc) return null;
  if (doc instanceof foundry.abstract.Document) return 'Document';
  if (doc.constructor?.name === 'PrototypeToken') return 'PrototypeToken';
  if (doc.documentName === 'DefaultMusic') return 'DefaultMusic';
  return null;
}

/**
 * Playlist context class for managing music contexts
 */
export class PlaylistContext {
  /**
   * @param {string} context - The context type ('area' or 'combat')
   * @param {Document} contextEntity - The entity providing the context
   * @param {object} playlist - The playlist to play
   * @param {string|null} trackId - Specific track ID or null for default
   * @param {number} priority - Priority level for sorting
   * @param {Document|null} scopeEntity - Entity for progress tracking
   */
  constructor(context, contextEntity, playlist, trackId, priority = 0, scopeEntity = null) {
    this.context = context;
    this.contextEntity = contextEntity;
    this.playlist = playlist;
    this.trackId = trackId;
    this.priority = priority;
    this.scopeEntity = scopeEntity;
    this._resolvedTracks = null;
  }

  /**
   * Get all tracks to play from this context based on track override or playlist mode
   * @returns {Array<object>} Array of tracks to play
   */
  get tracks() {
    if (this._resolvedTracks !== null) return this._resolvedTracks;
    this._resolvedTracks = this._resolveTracks();
    return this._resolvedTracks;
  }

  /**
   * Internal method to resolve tracks for this context
   * @returns {Array<object>} Array of tracks to play
   * @private
   */
  _resolveTracks() {
    if (!this.playlist) return [];

    if (this.trackId) {
      const track = this.playlist.sounds.get(this.trackId);
      return track ? [track] : [];
    }

    const mode = this.playlist.mode;
    const modes = globalThis.CONST?.PLAYLIST_MODES ?? { UNSEQUENCED: -1, SEQUENTIAL: 0, SHUFFLE: 1, SIMULTANEOUS: 2 };

    if (mode === modes.SIMULTANEOUS) {
      return Array.from(this.playlist.sounds.values());
    }

    if (mode === modes.SHUFFLE) {
      const order = this.playlist.playbackOrder || Array.from(this.playlist.sounds.keys());
      if (order.length === 0) return [];
      // Use the currently playing track from this playlist if one exists,
      // rather than picking a new random track each evaluation
      const currentlyPlaying = this.playlist.sounds.find((s) => s.playing);
      if (currentlyPlaying) return [currentlyPlaying];
      const randomIndex = Math.floor(Math.random() * order.length);
      const track = this.playlist.sounds.get(order[randomIndex]);
      return track ? [track] : [];
    }

    if (mode === modes.UNSEQUENCED) {
      return [];
    }

    const firstTrackId = this.playlist.playbackOrder?.[0] || Array.from(this.playlist.sounds.keys())[0];
    const track = firstTrackId ? this.playlist.sounds.get(firstTrackId) : null;
    return track ? [track] : [];
  }

  /**
   * Get the primary track to play from this context
   * @returns {object|null} The track or null
   */
  get track() {
    return this.tracks[0] || null;
  }

  /**
   * Extract playlist context data from a music section config object
   * @param {object} section - The music section data (e.g., from flags or settings)
   * @param {string} activeMood - Current active mood ID
   * @returns {{playlistId: string|null, trackId: string|null, priority: number}}
   * @private
   */
  static _extractSectionConfig(section, activeMood) {
    if (!section) return { playlistId: null, trackId: null, priority: 0 };
    const moodOverride = (activeMood && section.moods?.[activeMood]?.playlist) ? section.moods[activeMood] : null;
    const config = moodOverride || section;
    return {
      playlistId: config.playlist || null,
      trackId: config.initialTrack || null,
      priority: config.priority ?? section.priority ?? 0
    };
  }

  /**
   * Create playlist context from document
   * @param {Document|object} document - Source document or data model
   * @param {string} type - Music type ('area' or 'combat')
   * @param {Document} scopeEntity - Scope entity for progress tracking
   * @returns {PlaylistContext|null} Created context or null
   */
  static fromDocument(document, type = 'combat', scopeEntity = null) {
    if (!document) {
      log(3, `PlaylistContext.fromDocument: Document is null or undefined for type '${type}'`);
      return null;
    }
    const activeMood = game.settings.get(CONST.moduleId, CONST.settings.activeMood) || '';
    const docName = document.name || document.id || document?.constructor?.name;

    // Determine the music section based on document category
    let section;
    const category = getDocumentCategory(document);
    if (category === 'Document') {
      section = document.getFlag(CONST.moduleId, `music.${type}`) || {};
    } else if (category === 'PrototypeToken') {
      section = document.flags?.[CONST.moduleId]?.music?.[type];
    } else if (category === 'DefaultMusic') {
      section = document.data?.vgmusic?.music?.[type];
    } else {
      log(3, `PlaylistContext.fromDocument: Document of type '${document?.constructor?.name || typeof document}' is not supported (type: '${type}')`);
      return null;
    }

    const { playlistId, trackId, priority } = this._extractSectionConfig(section, activeMood);
    const playlist = playlistId ? game.playlists.get(playlistId) : null;

    if (!playlist) {
      log(3, `PlaylistContext.fromDocument: No playlist override found on document '${docName}' (type: '${type}', mood: '${activeMood || 'default'}')`);
      return null;
    }

    return new this(type, document, playlist, trackId, priority, scopeEntity);
  }
}

/**
 * Fading track handler for smooth transitions
 */
export class FadingTrack {
  /**
   * @param {object} track - The track to fade
   * @param {number} fadeDuration - Duration of fade in milliseconds
   */
  constructor(track, fadeDuration = 1000) {
    this.track = track;
    this.fadeDuration = fadeDuration;
    setTimeout(() => this.delete(), this.fadeDuration + 10);
  }

  /**
   * Remove this fading track from the controller
   */
  delete() {
    const controller = game.vgmusic?.musicController;
    if (!controller) return;
    const index = controller.fadingTracks.indexOf(this);
    if (index >= 0) {
      controller.fadingTracks.splice(index, 1);
      if (controller.currentTrack === this.track) controller.playCurrentTrack();
    }
  }
}

/**
 * Portable log function for the module
 * @param {number} level - Log level (1: error, 2: warn, 3: log)
 * @param {...*} args - Arguments to log
 */
export function log(level, ...args) {
  const prefix = 'VGMusic |';
  if (level > 1) {
    try {
      const enableDebug = game.settings.get(CONST.moduleId, 'enableDebug');
      if (!enableDebug) return;
    } catch (e) {
      // settings not yet initialized/ready
    }
  }
  switch (level) {
    case 1:
      console.error(prefix, ...args);
      break;
    case 2:
      console.warn(prefix, ...args);
      break;
    case 3:
    default:
      console.log(prefix, ...args);
      break;
  }
}
