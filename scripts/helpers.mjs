import { CONST } from './config.mjs';

/**
 * Utility helper functions
 */

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
  }

  /**
   * Get the track to play from this context
   * @returns {object|null} The track or null
   */
  get track() {
    if (this.trackId) return this.playlist?.sounds.get(this.trackId);
    const firstTrackId = this.playlist?.playbackOrder?.[0];
    return firstTrackId ? this.playlist.sounds.get(firstTrackId) : null;
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
    if (document instanceof foundry.abstract.Document) {
      const playlistId = document.getFlag(CONST.moduleId, `music.${type}.playlist`);
      let playlist = playlistId ? game.playlists.get(playlistId) : null;
      if (!playlist && document.documentName === 'Scene' && type === 'area') {
        playlist = document.playlist || game.playlists.get(document.playlistId) || null;
        if (playlist) {
          log(3, `No VGM override found for scene area music. Falling back to Scene's native playlist: '${playlist.name}'`);
        }
      }
      if (!playlist) {
        log(3, `PlaylistContext.fromDocument: No playlist override or fallback found on document '${document.name || document.id}' (type: '${type}')`);
        return null;
      }
      const trackId = document.getFlag(CONST.moduleId, `music.${type}.initialTrack`) || null;
      const priority = document.getFlag(CONST.moduleId, `music.${type}.priority`) ?? 0;
      return new this(type, document, playlist, trackId, priority, scopeEntity);
    }
    if (document?.constructor?.name === 'PrototypeToken') {
      const section = document.flags?.[CONST.moduleId]?.music?.[type];
      if (!section) {
        log(3, `PlaylistContext.fromDocument: No music section flags found on PrototypeToken '${document.name || document.id}' (type: '${type}')`);
        return null;
      }
      const playlistId = section.playlist;
      const playlist = playlistId ? game.playlists.get(playlistId) : null;
      if (!playlist) {
        log(3, `PlaylistContext.fromDocument: Playlist with ID '${playlistId}' not found for PrototypeToken '${document.name || document.id}' (type: '${type}')`);
        return null;
      }
      const trackId = section.initialTrack || null;
      const priority = section.priority ?? 0;
      return new this(type, document, playlist, trackId, priority, scopeEntity);
    }
    if (document?.documentName === 'DefaultMusic') {
      const section = document.data?.vgmusic?.music?.[type];
      if (!section) {
        log(3, `PlaylistContext.fromDocument: No music section found on DefaultMusic (type: '${type}')`);
        return null;
      }
      const playlistId = section.playlist;
      const playlist = playlistId ? game.playlists.get(playlistId) : null;
      if (!playlist) {
        log(3, `PlaylistContext.fromDocument: Playlist with ID '${playlistId}' not found for DefaultMusic (type: '${type}')`);
        return null;
      }
      const trackId = section.initialTrack || null;
      const priority = section.priority ?? 0;
      return new this(type, document, playlist, trackId, priority, scopeEntity);
    }
    log(3, `PlaylistContext.fromDocument: Document of type '${document?.constructor?.name || typeof document}' is not supported (type: '${type}')`);
    return null;
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

