import { CONST } from './config.mjs';
import { FadingTrack, isHeadGM, log, PlaylistContext } from './helpers.mjs';

/**
 * Get document type name, treating PrototypeToken as 'Token'
 * @param {Document|object} entity - The entity to check
 * @returns {string|undefined} The document type name
 */
function getEntityTypeName(entity) {
  if (entity?.documentName) return entity.documentName;
  if (entity?.constructor?.name === 'PrototypeToken') return 'Token';
  return undefined;
}

/**
 * Core music controller for managing playlist playback
 */
export class MusicController {
  /** Creates a new MusicController instance */
  constructor() {
    this.currentContext = null;
    this.fadingTracks = [];
    this.pendingPlayback = null;
  }

  /**
   * Get the current combat for the active scene
   * @returns {object|undefined} The current combat or undefined
   */
  get currentCombat() {
    return game.combats.find((combat) => combat.scene === this.currentScene) || game.combats.find((combat) => combat.active);
  }

  /**
   * Get the currently active scene
   * @returns {object|undefined} The active scene or undefined
   */
  get currentScene() {
    return game.scenes.find((scene) => scene.active);
  }

  /**
   * Get the currently playing track
   * @returns {object|null} The current track or null
   */
  /**
   * Get all currently playing tracks from the current context
   * @returns {Array<object>} Array of current tracks
   */
  get currentTracks() {
    return this.currentContext?.tracks || [];
  }

  /**
   * Get stored info for the current primary track
   * @returns {object} Track info or empty object
   */
  get currentTrackInfo() {
    if (!this.currentTrack) return {};
    const track = this.currentTrack;
    const info = this.currentContext?.scopeEntity?.getFlag(CONST.moduleId, `playlist.${track.parent.id}.${track.id}`);
    return info || {};
  }

  /**
   * Get stored info for a specific track
   * @param {object} track - Track document
   * @returns {object} Track info or empty object
   */
  getTrackInfo(track) {
    if (!track) return {};
    return this.currentContext?.scopeEntity?.getFlag(CONST.moduleId, `playlist.${track.parent.id}.${track.id}`) || {};
  }

  /**
   * Save current playlist position data for active tracks
   * @param {Document} entity - Entity to save data to
   */
  async savePlaylistData(entity) {
    if (entity instanceof Combat && !game.combats.get(entity.id)) {
      log(3, `Skipping savePlaylistData: combat entity '${entity.id}' is no longer active.`);
      return;
    }
    if (!isHeadGM()) {
      log(3, 'Skipping savePlaylistData: not head GM.');
      return;
    }
    const tracks = this.currentTracks;
    if (tracks.length === 0 || !entity) {
      log(3, 'Skipping savePlaylistData: no current tracks or invalid entity.');
      return;
    }
    for (const track of tracks) {
      const flagData = { id: track.parent.id, trackId: track.id, start: (track.sound?.currentTime ?? 0) % (track.sound?.duration ?? 100) };
      try {
        await entity.setFlag(CONST.moduleId, `playlist.${track.parent.id}.${track.id}`, flagData);
        log(3, `Successfully saved playlist position for track '${track.name}' on entity '${entity.name || entity.id}': start=${flagData.start}`);
      } catch (error) {
        log(1, `Failed to save playlist position for track '${track.name}' on entity '${entity.name || entity.id}':`, error);
      }
    }
  }

  /**
   * Play music for a given context
   * @param {PlaylistContext|null} context - Playlist context to play
   */
  async playMusic(context) {
    try {
      const prevTracks = this.currentTracks;
      const newTracks = context?.tracks || [];

      const tracksToStop = prevTracks.filter((pt) => !newTracks.some((nt) => nt.id === pt.id));
      const tracksToPlay = newTracks.filter((nt) => !prevTracks.some((pt) => pt.id === nt.id && pt.sound?.playing));

      if (tracksToStop.length === 0 && tracksToPlay.length === 0 && newTracks.length > 0) {
        log(3, `All tracks for context '${context?.playlist?.name}' are already playing. Skipping playback change.`);
        this.currentContext = context;
        return;
      }

      const fadeMs = game.settings.get(CONST.moduleId, CONST.settings.fadeDuration) * 1000;
      log(3, `Transitioning music context to '${context?.playlist?.name || 'None'}' (stopping ${tracksToStop.length} tracks, starting ${tracksToPlay.length} tracks, fade: ${fadeMs}ms)`);

      if (tracksToStop.length > 0) {
        await this.savePlaylistData(this.currentContext?.scopeEntity);
        for (const track of tracksToStop) {
          const isFadingPrev = this.fadingTracks.some((ft) => ft.track === track);
          if (this.isAudioReady()) {
            if (fadeMs > 0 && track.sound?.playing) {
              log(3, `Fading out track '${track.name}' over ${fadeMs}ms`);
              track.sound.fade(0, { duration: fadeMs });
              setTimeout(() => track.update({ playing: false, pausedTime: null }), fadeMs);
            } else {
              log(3, `Stopping track '${track.name}' immediately`);
              await track.update({ playing: false, pausedTime: null });
            }
          }
          const guardMs = fadeMs || track.fadeDuration;
          if (guardMs > 0 && !isFadingPrev) {
            log(3, `Adding track '${track.name}' to fading tracking list for ${guardMs}ms`);
            this.fadingTracks.push(new FadingTrack(track, guardMs));
          }
        }
      }

      this.currentContext = context;

      if (tracksToPlay.length > 0) {
        await this.waitForAudio(async () => {
          for (const track of tracksToPlay) {
            const trackInfo = this.getTrackInfo(track);
            const startTime = trackInfo?.start ?? 0;
            const shouldFadeIn = fadeMs > 0 && prevTracks.length > 0;
            log(3, `Preparing to play track '${track.name}' from position ${startTime}s (fadeIn: ${shouldFadeIn})`);
            if (shouldFadeIn) {
              const targetVolume = track.volume;
              log(3, `Fading in track '${track.name}' to volume ${targetVolume} over ${fadeMs}ms`);
              await track.update({ playing: true, pausedTime: startTime, volume: 0 });
              this._fadeInWhenReady(track, targetVolume, fadeMs);
            } else {
              log(3, `Playing track '${track.name}' immediately`);
              await track.update({ playing: true, pausedTime: startTime });
            }
          }
        });
      }
    } catch (error) {
      log(1, 'Error playing music transition:', error);
    }
  }

  /**
   * Poll for a track's sound node to be ready, then apply fade-in
   * @param {object} track - The PlaylistSound to fade in
   * @param {number} targetVolume - Volume to fade to
   * @param {number} fadeMs - Fade duration in milliseconds
   */
  _fadeInWhenReady(track, targetVolume, fadeMs) {
    if (!this._fadeInPolls) this._fadeInPolls = new Map();
    if (!this._fadeInSafeties) this._fadeInSafeties = new Map();

    if (this._fadeInPolls.has(track.id)) clearInterval(this._fadeInPolls.get(track.id));
    if (this._fadeInSafeties.has(track.id)) clearTimeout(this._fadeInSafeties.get(track.id));

    log(3, `Waiting for audio node readiness on track '${track.name}' before starting fade`);
    const poll = setInterval(() => {
      if (track.sound?.sourceNode) {
        clearInterval(poll);
        this._fadeInPolls.delete(track.id);
        log(3, `Track '${track.name}' audio ready. Applying volume fade to ${targetVolume} over ${fadeMs}ms.`);
        track.sound.fade(targetVolume, { duration: fadeMs });
        setTimeout(() => {
          track.update({ volume: targetVolume });
          log(3, `Completed volume update for track '${track.name}' to ${targetVolume}`);
        }, fadeMs);
      }
    }, 20);
    this._fadeInPolls.set(track.id, poll);

    const safety = setTimeout(() => {
      clearInterval(poll);
      this._fadeInPolls.delete(track.id);
      this._fadeInSafeties.delete(track.id);
      log(2, `Safety timeout triggered for track '${track.name}'. Forcing volume ${targetVolume}.`);
      track.update({ volume: targetVolume });
    }, fadeMs + 1000);
    this._fadeInSafeties.set(track.id, safety);
  }
}
