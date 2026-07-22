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
  get currentTrack() {
    return this.currentContext?.track;
  }

  /**
   * Get all currently playing tracks from the current context
   * @returns {Array<object>} Array of current tracks
   */
  get currentTracks() {
    return this.currentContext?.tracks || [];
  }

  /**
   * Get stored info for the current track
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
   * Check if game audio is ready for playback
   * @returns {boolean} True if audio is unlocked
   */
  isAudioReady() {
    return game.audio && !game.audio.locked;
  }

  /**
   * Wait for audio to be ready or defer playback
   * @param {Function} playCallback - Function to call when audio is ready
   */
  async waitForAudio(playCallback) {
    if (this.isAudioReady()) {
      await playCallback();
    } else {
      this.pendingPlayback = playCallback;
      const onAudioUnlock = async () => {
        if (this.pendingPlayback) {
          await this.pendingPlayback();
          this.pendingPlayback = null;
        }
        document.removeEventListener('click', onAudioUnlock);
        document.removeEventListener('keydown', onAudioUnlock);
      };
      document.addEventListener('click', onAudioUnlock, { once: true });
      document.addEventListener('keydown', onAudioUnlock, { once: true });
    }
  }

  /**
   * Determine which document to use for combatant music
   * @param {object} token - The combatant's token
   * @param {object} actor - The combatant's actor
   * @returns {Document|object|null} The document to use for music lookup
   */
  _getCombatantMusicSource(token, actor) {
    if (!token && !actor) {
      log(3, '_getCombatantMusicSource: Both token and actor are missing.');
      return null;
    }
    const tokenHasMusic = token?.getFlag(CONST.moduleId, 'music.combat.playlist');
    const prototypeToken = actor?.prototypeToken;
    const prototypeHasMusic = prototypeToken?.flags?.[CONST.moduleId]?.music?.combat?.playlist;
    const actorHasMusic = actor?.getFlag(CONST.moduleId, 'music.combat.playlist');
    if (token && !token.actorLink) {
      if (tokenHasMusic) return token;
      if (actorHasMusic) return actor;
      log(3, `_getCombatantMusicSource: No combat music override found for unlinked token '${token.name}' or its actor.`);
      return null;
    }
    if (token && token.actorLink) {
      if (tokenHasMusic) {
        const useTokenMusic = token.getFlag(CONST.moduleId, 'useTokenMusic');
        if (useTokenMusic || (!prototypeHasMusic && !actorHasMusic)) return token;
      }
      if (prototypeHasMusic) return prototypeToken;
    }
    if (actorHasMusic) return actor;
    log(3, `_getCombatantMusicSource: No combat music override found for linked token/actor '${actor?.name || token?.name}'`);
    return null;
  }

  /**
   * Get all current playlist contexts
   * @returns {PlaylistContext[]} Array of playlist contexts
   */
  getAllCurrentPlaylists() {
    const contexts = [];
    const scene = this.currentScene;
    const combat = this.currentCombat;
    if (scene) {
      const ctx = PlaylistContext.fromDocument(scene, 'area', scene);
      if (ctx) contexts.push(ctx);
    }
    if (scene) {
      const ctx = PlaylistContext.fromDocument(scene, 'combat', combat);
      if (ctx) contexts.push(ctx);
    }
    if (combat?.combatant) {
      for (const combatant of combat.combatants) {
        const musicSource = this._getCombatantMusicSource(combatant.token, combatant.actor);
        if (musicSource) {
          const ctx = PlaylistContext.fromDocument(musicSource, 'combat', combat);
          if (ctx) contexts.push(ctx);
        }
      }
    }
    if (combat) {
      const defaultConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic);
      if (defaultConfig) {
        const ctx = PlaylistContext.fromDocument(defaultConfig, 'combat', combat);
        if (ctx) contexts.push(ctx);
      }
    }
    return contexts;
  }

  /**
   * Filter playlist contexts based on current state
   * @param {PlaylistContext} context - Context to filter
   * @returns {boolean} True if context should be included
   */
  filterPlaylists(context) {
    const combat = this.currentCombat;
    if (context.context === 'combat' && !combat?.started) return false;
    if (context.context === 'combat' && game.settings.get(CONST.moduleId, CONST.settings.suppressCombat)) return false;
    if (context.context === 'area' && game.settings.get(CONST.moduleId, CONST.settings.suppressArea)) return false;
    return true;
  }

  /**
   * Sort playlist contexts by priority
   * @param {PlaylistContext} a - First context
   * @param {PlaylistContext} b - Second context
   * @returns {number} Sort comparison result
   */
  sortPlaylists(a, b) {
    const combat = this.currentCombat;
    const currentCombatant = combat?.combatant;
    const currentToken = currentCombatant?.token;
    const currentActor = currentCombatant?.actor;
    const currentPrototype = currentActor?.prototypeToken;
    const isCurrentA = a.contextEntity === currentToken || a.contextEntity === currentActor || a.contextEntity === currentPrototype;
    const isCurrentB = b.contextEntity === currentToken || b.contextEntity === currentActor || b.contextEntity === currentPrototype;
    if (isCurrentA && !isCurrentB) return -1;
    if (isCurrentB && !isCurrentA) return 1;
    const silentMode = game.settings.get(CONST.moduleId, CONST.settings.silentCombatMusicMode);
    if (silentMode === CONST.silentModes.lastActor) {
      const combatants = combat?.turns || [];
      const startIdx = combat?.current?.turn || 0;
      if (startIdx >= 0 && combatants.length > 0) {
        let i = startIdx;
        do {
          i = (i - 1 + combatants.length) % combatants.length;
          const actor = combatants[i]?.actor;
          const prototype = actor?.prototypeToken;
          if (a.contextEntity === actor || a.contextEntity === prototype) return -1;
          if (b.contextEntity === actor || b.contextEntity === prototype) return 1;
        } while (i !== (startIdx + 1) % combatants.length);
      }
    } else if (silentMode === CONST.silentModes.area) {
      if (getEntityTypeName(a.contextEntity) !== 'Actor' && a.context === 'area') return -1;
      if (getEntityTypeName(b.contextEntity) !== 'Actor' && b.context === 'area') return 1;
    } else if (silentMode === CONST.silentModes.generic) {
      if (getEntityTypeName(a.contextEntity) !== 'Actor' && a.context === 'combat') return -1;
      if (getEntityTypeName(b.contextEntity) !== 'Actor' && b.context === 'combat') return 1;
    }
    if (a.priority !== b.priority) return b.priority - a.priority;
    const aTypeName = getEntityTypeName(a.contextEntity);
    const bTypeName = getEntityTypeName(b.contextEntity);
    if (aTypeName !== bTypeName) {
      const priorities = CONST.documentSortPriority;
      return priorities.indexOf(bTypeName) - priorities.indexOf(aTypeName);
    }
    return 0;
  }

  /**
   * Get the current highest priority playlist context
   * @returns {PlaylistContext|null} Current context or null
   */
  getCurrentPlaylist() {
    const allContexts = this.getAllCurrentPlaylists();
    const filteredContexts = allContexts.filter(this.filterPlaylists.bind(this));
    const sortedContexts = filteredContexts.sort(this.sortPlaylists.bind(this));
    if (sortedContexts.length > 0) {
      return sortedContexts[0];
    }
    log(3, `getCurrentPlaylist: No active playlist contexts found after filtering (total contexts checked: ${allContexts.length}, after filter: ${filteredContexts.length})`);
    return null;
  }

  /**
   * Play the current track based on context
   */
  playCurrentTrack() {
    if (!isHeadGM()) {
      log(3, 'Skipping playCurrentTrack: not head GM');
      return;
    }
    clearTimeout(this._playDebounce);
    log(3, 'Debouncing track play calculation...');
    this._playDebounce = setTimeout(async () => {
      try {
        const newContext = this.getCurrentPlaylist();
        log(3, `Resolved current playlist context: ${newContext ? `${newContext.context} - '${newContext.playlist.name}' (track: '${newContext.track?.name || 'Default'}')` : 'None'}`);
        await this.playMusic(newContext);
      } catch (error) {
        log(1, 'Error in debounced playCurrentTrack execution:', error);
      }
    }, 50);
  }

  /**
   * Get playlist data for a track
   * @param {Document} entity - Entity to get data from
   * @param {string} playlistId - Playlist ID
   * @param {string} trackId - Track ID
   * @returns {object} Playlist data
   */
  getPlaylistData(entity, playlistId, trackId) {
    const data = entity.getFlag(CONST.moduleId, `playlist.${playlistId}.${trackId}`);
    return data || { id: playlistId, trackId, start: 0 };
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
