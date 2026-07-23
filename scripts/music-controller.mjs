import { CONST } from './config.mjs';
import { log, PlaylistContext, FadingTrack, isHeadGM } from './helpers.mjs';

/**
 * Main music controller class for VGMusic module
 */
export class MusicController {
  constructor() {
    this.fadingTracks = [];
    this.currentTracks = [];
    this.currentContext = null;
    this.isDebouncing = false;
    this._savedPlaylistPositions = new Map();
    this._audioUnlockRegistered = false;
  }

  /**
   * Get primary current track
   * @returns {object|null}
   */
  get currentTrack() {
    return this.currentTracks[0] || null;
  }

  /**
   * Get active scene
   * @returns {Scene|null} Active scene document
   */
  get currentScene() {
    return game.scenes?.active || null;
  }

  /**
   * Get active combat
   * @returns {Combat|null} Active combat document
   */
  get currentCombat() {
    return game.combats?.active || null;
  }

  /**
   * Check if game audio is locked by the browser
   * @returns {boolean} True if audio is locked
   */
  isAudioLocked() {
    return game.audio?.locked ?? false;
  }

  /**
   * Play current track according to highest priority playlist context
   */
  async playCurrentTrack() {
    if (this.isDebouncing) return;
    if (!isHeadGM()) return;

    if (this.isAudioLocked()) {
      log(3, 'Game audio is locked by browser gesture requirement. Awaiting user interaction...');
      if (!this._audioUnlockRegistered) {
        this._audioUnlockRegistered = true;
        let unlockHandled = false;
        const unlockHandler = () => {
          if (unlockHandled) return;
          unlockHandled = true;
          document.removeEventListener('pointerdown', unlockHandler);
          document.removeEventListener('keydown', unlockHandler);
          this._audioUnlockRegistered = false;
          log(3, 'User gesture detected. Triggering playCurrentTrack...');
          setTimeout(() => {
            this.playCurrentTrack();
          }, 100);
        };
        document.addEventListener('pointerdown', unlockHandler, { once: true });
        document.addEventListener('keydown', unlockHandler, { once: true });
      }
      return;
    }

    this.isDebouncing = true;
    log(3, 'Debouncing track play calculation...');

    try {
      const contexts = this.getAllCurrentPlaylists();
      const validContexts = contexts.filter((ctx) => this.filterPlaylists(ctx));
      const combat = this.currentCombat;
      validContexts.sort((a, b) => this.sortPlaylists(a, b, combat));

      const winnerContext = validContexts[0] || null;
      const targetTracks = winnerContext?.tracks || [];
      const primaryTrackName = targetTracks[0]?.name || 'none';

      log(3, `Resolved current playlist context: ${winnerContext?.context || 'none'} - '${winnerContext?.playlist?.name || 'none'}' (${targetTracks.length} tracks, primary: '${primaryTrackName}')`);

      if (
        this.currentContext?.playlist?.id === winnerContext?.playlist?.id &&
        this.currentTracks?.length === targetTracks.length &&
        this.currentTracks.every((t, i) => t.id === targetTracks[i]?.id)
      ) {
        log(3, 'Current tracks already match resolved target context. No change.');
        return;
      }

      await this.transitionToContext(winnerContext);
    } catch (error) {
      log(1, 'Error in playCurrentTrack calculation:', error);
    } finally {
      setTimeout(() => {
        this.isDebouncing = false;
      }, 300);
    }
  }

  /**
   * Transition to a target playlist context
   * @param {PlaylistContext|null} targetContext Target context to play
   */
  async transitionToContext(targetContext) {
    const targetTracks = targetContext?.tracks || [];
    const targetTrackIds = new Set(targetTracks.map((t) => t.id));
    const fadeDurationSec = game.settings.get(CONST.moduleId, CONST.settings.fadeDuration) ?? 3;
    const fadeDurationMs = fadeDurationSec * 1000;

    log(3, `Transitioning music context to '${targetContext?.playlist?.name || 'none'}' (stopping ${this.fadingTracks.length} tracks, starting ${targetTracks.length} tracks, fade: ${fadeDurationMs}ms)`);

    // Clear any stale fading track entries in-place from previous transitions
    this.fadingTracks.length = 0;

    // Save progress position of current tracks before stopping/fading
    if (this.currentTracks?.length && this.currentContext?.scopeEntity) {
      for (const track of this.currentTracks) {
        this.savePlaylistData(this.currentContext.scopeEntity, track);
      }
    }

    // Fade out current playing tracks (excluding targetTracks)
    for (const activeSound of game.playlists.playing.flatMap((p) => Array.from(p.sounds.values()))) {
      if (targetTrackIds.has(activeSound.id)) continue;
      if (activeSound.playing) {
        const soundObj = activeSound.sound || activeSound;
        if (fadeDurationMs > 0 && typeof soundObj?.fade === 'function') {
          log(3, `Fading out track '${activeSound.name}' over ${fadeDurationMs}ms`);
          soundObj.fade(0, { duration: fadeDurationMs }).then(() => {
            this.stopTrack(activeSound);
          }).catch(() => {
            this.stopTrack(activeSound);
          });
          this.fadingTracks.push(new FadingTrack(activeSound, fadeDurationMs));
        } else {
          this.stopTrack(activeSound);
        }
      }
    }

    this.currentContext = targetContext;
    this.currentTracks = targetTracks;

    for (const targetTrack of targetTracks) {
      const savedPosition = this.getPlaylistData(targetContext.scopeEntity, targetTrack);
      const originalVolume = targetTrack.volume ?? targetTrack.sound?.volume ?? 1.0;
      log(3, `Preparing to play track '${targetTrack.name}' from position ${savedPosition}s (targetVolume: ${originalVolume}, fadeIn: ${fadeDurationMs > 0})`);

      if (fadeDurationMs > 0) {
        await targetTrack.update({ offset: savedPosition, volume: 0 });
        await this.playTrack(targetTrack);
        this._fadeInWhenReady(targetTrack, fadeDurationMs, originalVolume);
      } else {
        await targetTrack.update({ offset: savedPosition });
        await this.playTrack(targetTrack);
      }
    }
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
      const ctx = PlaylistContext.fromDocument(scene, 'combat', scene);
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
    const defaultConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic);
    if (defaultConfig) {
      if (combat) {
        const ctx = PlaylistContext.fromDocument(defaultConfig, 'combat', combat);
        if (ctx) contexts.push(ctx);
      }
      const areaCtx = PlaylistContext.fromDocument(defaultConfig, 'area', scene);
      if (areaCtx) contexts.push(areaCtx);
    }
    return contexts;
  }

  /**
   * Check if a playlist is configured or managed by VGMusic
   * @param {object} playlist - Playlist document to check
   * @returns {boolean} True if playlist is managed by VGMusic
   */
  isManagedPlaylist(playlist) {
    if (!playlist) return false;

    if (this.currentContext?.playlist?.id === playlist.id) return true;

    const hasPlaylistId = (musicData, id) => {
      if (!musicData) return false;
      for (const section of Object.values(musicData)) {
        if (section?.playlist === id) return true;
        if (section?.moods) {
          for (const moodConfig of Object.values(section.moods)) {
            if (moodConfig?.playlist === id) return true;
          }
        }
      }
      return false;
    };

    for (const scene of game.scenes || []) {
      const sceneMusic = scene.getFlag(CONST.moduleId, 'music');
      if (hasPlaylistId(sceneMusic, playlist.id)) return true;
    }

    for (const actor of game.actors || []) {
      const actorMusic = actor.getFlag(CONST.moduleId, 'music');
      if (hasPlaylistId(actorMusic, playlist.id)) return true;
      const protoMusic = actor.prototypeToken?.flags?.[CONST.moduleId]?.music;
      if (hasPlaylistId(protoMusic, playlist.id)) return true;
    }

    try {
      const defaultConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic);
      const defaultMusic = defaultConfig?.data?.vgmusic?.music;
      if (hasPlaylistId(defaultMusic, playlist.id)) return true;
    } catch (e) {
      // setting not initialized
    }

    return false;
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
   * @param {Combat|null} combat - Active combat document
   * @returns {number} Sort comparison result
   */
  sortPlaylists(a, b, combat = null) {
    combat = combat ?? this.currentCombat;
    const currentCombatant = combat?.combatant;
    const currentToken = currentCombatant?.token;
    const currentActor = currentCombatant?.actor;
    const currentPrototype = currentActor?.prototypeToken;
    const isCurrentA = a.contextEntity === currentToken || a.contextEntity === currentActor || a.contextEntity === currentPrototype;
    const isCurrentB = b.contextEntity === currentToken || b.contextEntity === currentActor || b.contextEntity === currentPrototype;
    if (isCurrentA && !isCurrentB) return -1;
    if (!isCurrentA && isCurrentB) return 1;

    return b.priority - a.priority;
  }

  /**
   * Internal helper to find music source for a combatant
   * @param {TokenDocument} token Token document
   * @param {Actor} actor Actor document
   * @returns {Document|null} Resolving document for combat music
   * @private
   */
  _getCombatantMusicSource(token, actor) {
    if (!token && !actor) return null;
    const isLinked = token?.actorLink ?? false;
    const useTokenMusic = token?.getFlag?.(CONST.moduleId, 'useTokenMusic') ?? false;

    if (isLinked) {
      if (useTokenMusic && token) return token;
      if (actor) return actor;
      if (token) return token;
    } else {
      if (token) return token;
      if (actor?.prototypeToken) return actor.prototypeToken;
      if (actor) return actor;
    }
    return null;
  }

  /**
   * Play a track sound object safely
   * @param {object} sound Sound object to play
   */
  async playTrack(sound) {
    if (!sound) return;
    try {
      if (sound.parent?.playSound) {
        await sound.parent.playSound(sound);
      } else if (typeof sound.play === 'function') {
        await sound.play();
      }
    } catch (error) {
      if (error?.name === 'AbortError' || error?.message?.includes('interrupted')) {
        return;
      }
      log(1, `Error playing track '${sound.name}':`, error);
    }
  }

  /**
   * Stop a track sound object safely
   * @param {object} sound Track sound object to stop
   */
  stopTrack(sound) {
    if (!sound) return;
    try {
      if (sound.parent?.stopSound) {
        sound.parent.stopSound(sound)?.catch?.(() => {});
      } else if (sound.sound?.stop) {
        sound.sound.stop();
      } else if (typeof sound.stop === 'function') {
        sound.stop();
      }
    } catch (error) {
      // Ignore abort errors from rapid playback transitions
    }
  }

  /**
   * Save track playback offset position onto entity flags / memory
   * @param {Document} entity Entity to save progress onto
   * @param {object} sound Track sound object
   */
  savePlaylistData(entity, sound) {
    if (!entity || !sound) {
      log(3, 'Skipping savePlaylistData: no current tracks or invalid entity.');
      return;
    }

    const soundId = sound.id;
    const currentOffset = sound.sound?.currentTime || 0;

    const entityKey = `${entity.documentName || 'Entity'}_${entity.id}`;
    if (!this._savedPlaylistPositions.has(entityKey)) {
      // Evict oldest entry if cache exceeds 50 entities
      if (this._savedPlaylistPositions.size >= 50) {
        const oldestKey = this._savedPlaylistPositions.keys().next().value;
        this._savedPlaylistPositions.delete(oldestKey);
      }
      this._savedPlaylistPositions.set(entityKey, {});
    }
    const entityPositions = this._savedPlaylistPositions.get(entityKey);
    entityPositions[soundId] = currentOffset;

    log(3, `Successfully saved playlist position for track '${sound.name}' on entity '${entity.name || entity.id}': start=${currentOffset}`);
  }

  /**
   * Get saved track playback offset position from entity flags / memory
   * @param {Document} entity Entity to retrieve progress from
   * @param {object} sound Track sound object
   * @returns {number} Saved offset in seconds
   */
  getPlaylistData(entity, sound) {
    if (!entity || !sound) return 0;

    const soundId = sound.id;
    const entityKey = `${entity.documentName || 'Entity'}_${entity.id}`;
    const entityPositions = this._savedPlaylistPositions.get(entityKey);

    return entityPositions?.[soundId] ?? 0;
  }

  /**
   * Fade in track volume safely after unlock
   * @param {object} track Track sound object
   * @param {number} fadeDurationMs Fade duration in milliseconds
   * @param {number} targetVolume Desired final volume level
   * @private
   */
  _fadeInWhenReady(track, fadeDurationMs, targetVolume = 1.0) {
    const finalVolume = targetVolume ?? track.volume ?? 1.0;
    log(3, `Fading in track '${track.name}' to volume ${finalVolume} over ${fadeDurationMs}ms`);

    let attempts = 0;
    const maxAttempts = 20; // 2 seconds max retry

    const waitForAudio = () => {
      attempts++;
      const soundObj = track.sound || track;
      const isReady = track.sound ? (track.sound.loaded || track.sound.playing || track.playing || attempts >= maxAttempts) : true;

      if (isReady) {
        log(3, `Track '${track.name}' audio ready. Applying volume fade to ${finalVolume} over ${fadeDurationMs}ms.`);
        if (typeof soundObj?.fade === 'function') {
          soundObj.fade(finalVolume, { duration: fadeDurationMs }).then(() => {
            track.update({ volume: finalVolume }).catch(() => {});
          });
        } else if (typeof soundObj?.volume !== 'undefined') {
          soundObj.volume = finalVolume;
          track.update({ volume: finalVolume }).catch(() => {});
        }
      } else {
        setTimeout(waitForAudio, 100);
      }
    };

    waitForAudio();
  }
}
