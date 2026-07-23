import { CONST } from './config.mjs';
import { log, resolveInitialTrack, getAvailablePlaylists, buildPlaylistEntry } from './helpers.mjs';
import { MoodConfigApp } from './mood-config.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop } = foundry.applications.ux;

/**
 * Playlist Hierarchy Tree Manager application
 */
export class PlaylistTreeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'vgmusic-playlist-tree',
    tag: 'div',
    window: { title: 'VGMusic.PlaylistTree.Title', icon: 'fas fa-sitemap', resizable: true, minimizable: true },
    classes: ['vgmusic-playlist-tree-window'],
    position: { width: 720, height: 'auto' },
    dragDrop: [{ dragSelector: null, dropSelector: '.context-box[data-drop-scope]', permissions: { dragstart: false, drop: true }, callbacks: {} }],
    actions: {
      selectScene: PlaylistTreeApp.handleSelectScene,
      updateSceneMood: PlaylistTreeApp.handleUpdateSceneMood,
      updateSceneMoodTrack: PlaylistTreeApp.handleUpdateSceneMoodTrack,
      clearSceneMood: PlaylistTreeApp.handleClearSceneMood,
      updateSceneDefault: PlaylistTreeApp.handleUpdateSceneDefault,
      updateSceneDefaultTrack: PlaylistTreeApp.handleUpdateSceneDefaultTrack,
      clearSceneDefault: PlaylistTreeApp.handleClearSceneDefault,
      updateGlobalMood: PlaylistTreeApp.handleUpdateGlobalMood,
      updateGlobalMoodTrack: PlaylistTreeApp.handleUpdateGlobalMoodTrack,
      clearGlobalMood: PlaylistTreeApp.handleClearGlobalMood,
      updateGlobalDefault: PlaylistTreeApp.handleUpdateGlobalDefault,
      updateGlobalDefaultTrack: PlaylistTreeApp.handleUpdateGlobalDefaultTrack,
      clearGlobalDefault: PlaylistTreeApp.handleClearGlobalDefault,
      openMoodConfig: PlaylistTreeApp.handleOpenMoodConfig,
      toggleSection: PlaylistTreeApp.handleToggleSection
    }
  };

  /** @override */
  static PARTS = { main: { template: 'modules/vgmusic/templates/playlist-tree.hbs' } };

  constructor(options = {}) {
    super(options);
    const activeSceneId = game.scenes?.active?.id || '';
    this.selectedSceneId = options.selectedSceneId || activeSceneId || 'global';
    this.expandedSections = new Set(options.expandedSections || []);
    this.collapsedSections = new Set(options.collapsedSections || []);
  }

  /**
   * Helper to evaluate if a section or card is collapsed
   * @param {string} key - Section or card identifier key
   * @param {boolean} hasOverride - Whether the item has active overrides configured
   * @returns {boolean} True if collapsed
   */
  isSectionCollapsed(key, hasOverride) {
    if (this.expandedSections.has(key)) return false;
    if (this.collapsedSections.has(key)) return true;
    return !hasOverride;
  }

  /** @override */
  _prepareContext(_options) {
    const availablePlaylists = getAvailablePlaylists();
    const buildEntry = (playlistId, trackId) => buildPlaylistEntry(availablePlaylists, playlistId, trackId);

    const activeScene = game.scenes?.active || null;

    const scenes = (game.scenes?.contents || Array.from(game.scenes || [])).map((s) => ({
      id: s.id,
      name: s.name,
      isActive: s.id === activeScene?.id,
      isSelected: s.id === this.selectedSceneId
    }));

    const selectedScene = game.scenes?.get(this.selectedSceneId) || null;
    const configuredMoods = game.settings.get(CONST.moduleId, CONST.settings.configuredMoods) || CONST.defaultMoods;
    const activeMood = game.settings.get(CONST.moduleId, CONST.settings.activeMood) || '';

    // Determine current active audio resolution context
    const currentControllerContext = game.vgmusic?.musicController?.currentContext || null;
    const winningEntity = currentControllerContext?.contextEntity;
    const winningIsMood = currentControllerContext?.isMood ?? false;

    // Build Scene Moods context data
    const sceneMoods = configuredMoods.map((m) => {
      const areaPlId = selectedScene ? selectedScene.getFlag(CONST.moduleId, `music.area.moods.${m.id}.playlist`) || null : null;
      const areaTrId = selectedScene ? selectedScene.getFlag(CONST.moduleId, `music.area.moods.${m.id}.initialTrack`) || null : null;

      const combatPlId = selectedScene ? selectedScene.getFlag(CONST.moduleId, `music.combat.moods.${m.id}.playlist`) || null : null;
      const combatTrId = selectedScene ? selectedScene.getFlag(CONST.moduleId, `music.combat.moods.${m.id}.initialTrack`) || null : null;

      const hasOverride = !!(areaPlId || combatPlId);
      const isResolving = winningEntity === selectedScene && winningIsMood && activeMood === m.id;
      const cardKey = `sceneMood:${m.id}`;
      const isCardCollapsed = this.isSectionCollapsed(cardKey, hasOverride);

      return {
        moodId: m.id,
        label: m.label,
        icon: m.icon,
        color: m.color,
        area: buildEntry(areaPlId, areaTrId),
        combat: buildEntry(combatPlId, combatTrId),
        isActive: activeMood === m.id,
        isResolving,
        hasOverride,
        isCardCollapsed,
        cardKey
      };
    });

    // Build Scene Defaults context data
    const sceneDefaults = {
      area: buildEntry(
        selectedScene ? selectedScene.getFlag(CONST.moduleId, 'music.area.playlist') || null : null,
        selectedScene ? selectedScene.getFlag(CONST.moduleId, 'music.area.initialTrack') || null : null
      ),
      combat: buildEntry(
        selectedScene ? selectedScene.getFlag(CONST.moduleId, 'music.combat.playlist') || null : null,
        selectedScene ? selectedScene.getFlag(CONST.moduleId, 'music.combat.initialTrack') || null : null
      )
    };

    const sceneMoodsResolving = winningEntity === selectedScene && winningIsMood;
    const sceneDefaultsResolving = winningEntity === selectedScene && !winningIsMood;

    // Build Global Default & Mood context data
    const defaultConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const defaultData = defaultConfig?.data?.vgmusic?.music || {};

    const globalMoods = configuredMoods.map((m) => {
      const areaPlId = defaultData.area?.moods?.[m.id]?.playlist || null;
      const areaTrId = defaultData.area?.moods?.[m.id]?.initialTrack || null;

      const combatPlId = defaultData.combat?.moods?.[m.id]?.playlist || null;
      const combatTrId = defaultData.combat?.moods?.[m.id]?.initialTrack || null;

      const hasOverride = !!(areaPlId || combatPlId);
      const isResolving = winningEntity?.documentName === 'DefaultMusic' && winningIsMood && activeMood === m.id;
      const cardKey = `globalMood:${m.id}`;
      const isCardCollapsed = this.isSectionCollapsed(cardKey, hasOverride);

      return {
        moodId: m.id,
        label: m.label,
        icon: m.icon,
        color: m.color,
        area: buildEntry(areaPlId, areaTrId),
        combat: buildEntry(combatPlId, combatTrId),
        isActive: activeMood === m.id,
        isResolving,
        hasOverride,
        isCardCollapsed,
        cardKey
      };
    });

    const globalDefaults = {
      area: buildEntry(defaultData.area?.playlist || null, defaultData.area?.initialTrack || null),
      combat: buildEntry(defaultData.combat?.playlist || null, defaultData.combat?.initialTrack || null)
    };

    const globalMoodsResolving = winningEntity?.documentName === 'DefaultMusic' && winningIsMood;
    const globalDefaultsResolving = winningEntity?.documentName === 'DefaultMusic' && !winningIsMood;

    // Active resolution status pill text
    let activeResolutionInfo = null;
    if (currentControllerContext) {
      let label = 'Active Audio: ';
      if (winningEntity === selectedScene) {
        label += winningIsMood ? `Scene Mood (${activeMood})` : 'Scene Default';
      } else if (winningEntity?.documentName === 'DefaultMusic') {
        label += winningIsMood ? `Global Mood (${activeMood})` : 'Global Default';
      } else if (winningEntity) {
        label += `${winningEntity.name || 'Token/Actor'}`;
      } else {
        label += 'None';
      }
      activeResolutionInfo = { label };
    }

    const hasSceneMoodsOverride = sceneMoods.some((m) => m.hasOverride);
    const hasSceneDefaultsOverride = !!(sceneDefaults.area.playlistId || sceneDefaults.combat.playlistId);
    const hasGlobalMoodsOverride = globalMoods.some((m) => m.hasOverride);
    const hasGlobalDefaultsOverride = !!(globalDefaults.area.playlistId || globalDefaults.combat.playlistId);

    const collapsed = {
      sceneMoods: this.isSectionCollapsed('sceneMoods', hasSceneMoodsOverride),
      sceneDefaults: this.isSectionCollapsed('sceneDefaults', hasSceneDefaultsOverride),
      globalMoods: this.isSectionCollapsed('globalMoods', hasGlobalMoodsOverride),
      globalDefaults: this.isSectionCollapsed('globalDefaults', hasGlobalDefaultsOverride)
    };

    return {
      scenes,
      selectedSceneId: this.selectedSceneId,
      selectedScene,
      availablePlaylists,
      configuredMoods,
      sceneMoods,
      sceneDefaults,
      sceneMoodsResolving,
      sceneDefaultsResolving,
      globalMoods,
      globalDefaults,
      globalMoodsResolving,
      globalDefaultsResolving,
      activeResolutionInfo,
      collapsed
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.element && !this._changeListenerBound) {
      this._onChangeInputHandler = (event) => this._onChangeInput(event);
      this.element.addEventListener('change', this._onChangeInputHandler);
      this._changeListenerBound = true;
    }
    if (this.element && !this._dragLeaveListenerBound) {
      this._onDragLeaveHandler = (event) => this._onDragLeaveExternal(event);
      this.element.addEventListener('dragleave', this._onDragLeaveHandler);
      this._dragLeaveListenerBound = true;
    }
    this._setupDragDrop();
  }

  /**
   * Bind drop handling for Playlist/PlaylistSound documents dragged in from
   * the sidebar Playlists directory onto an Area/Combat context box
   * @private
   */
  _setupDragDrop() {
    const dragDropConfigs = this.options.dragDrop || PlaylistTreeApp.DEFAULT_OPTIONS.dragDrop || [];
    for (const dragDropOptions of dragDropConfigs) {
      dragDropOptions.callbacks = {
        dragover: this._onDragOverExternal.bind(this),
        drop: this._onDropExternal.bind(this)
      };
      new DragDrop(dragDropOptions).bind(this.element);
    }
  }

  /**
   * Clear hover feedback once a drag genuinely leaves a context box (as opposed to
   * moving between its child elements, which also fires dragleave on the box)
   * @param {DragEvent} event
   * @private
   */
  _onDragLeaveExternal(event) {
    const box = event.target.closest?.('.context-box[data-drop-scope]');
    if (!box) return;
    if (event.relatedTarget && box.contains(event.relatedTarget)) return;
    box.classList.remove('drop-hover');
  }

  /**
   * Handle drag-over on a context box to show hover feedback for a valid external drag
   * @param {DragEvent} event
   * @private
   */
  _onDragOverExternal(event) {
    event.preventDefault();
    if (event.dataTransfer.types.includes('text/plain')) event.currentTarget.classList.add('drop-hover');
  }

  /**
   * Handle dropping a Playlist or PlaylistSound from the sidebar onto an Area/Combat context box
   * @param {DragEvent} event
   * @private
   */
  async _onDropExternal(event) {
    const target = event.currentTarget;
    target.classList.remove('drop-hover');

    try {
      const dataString = event.dataTransfer.getData('text/plain');
      if (!dataString) return false;
      let data;
      try {
        data = JSON.parse(dataString);
      } catch (e) {
        log(1, 'Failed to parse drag data:', e);
        return false;
      }
      if (!['Playlist', 'PlaylistSound'].includes(data.type) || !data.uuid) return false;

      const document = await fromUuid(data.uuid);
      if (!document) {
        log(2, `Failed to handle playlist tree drop: document with UUID '${data.uuid}' not found`);
        return false;
      }

      let playlist, sound;
      if (document instanceof PlaylistSound) {
        playlist = document.parent;
        sound = document;
      } else if (document instanceof Playlist) {
        playlist = document;
      } else {
        log(2, `Failed to handle playlist tree drop: resolved document is not a Playlist or PlaylistSound`);
        return false;
      }

      const { dropScope, contextType, moodId } = target.dataset;
      const path = PlaylistTreeApp._buildPath(contextType, moodId || null);

      if (dropScope === 'scene') {
        const scene = game.scenes?.get(this.selectedSceneId);
        if (!scene) return false;
        await PlaylistTreeApp._applySceneEntry(scene, path, playlist.id, sound?.id);
      } else {
        await PlaylistTreeApp._applyGlobalEntry(path, playlist.id, sound?.id);
      }

      game.vgmusic?.musicController?.playCurrentTrack();
      this.render(false);
      log(3, `Successfully assigned playlist '${playlist.name}' via drop (scope: '${dropScope}', context: '${contextType}', mood: '${moodId || 'default'}')`);
      return true;
    } catch (error) {
      log(1, 'Error handling playlist tree drop:', error);
      return false;
    }
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    if (this.element && this._onChangeInputHandler) {
      this.element.removeEventListener('change', this._onChangeInputHandler);
    }
    this._changeListenerBound = false;
    if (this.element && this._onDragLeaveHandler) {
      this.element.removeEventListener('dragleave', this._onDragLeaveHandler);
    }
    this._dragLeaveListenerBound = false;
  }

  /**
   * Maps `data-change-action` values to their handler method name. Looked up
   * dynamically on the class (rather than captured by reference) so that
   * spying/mocking a handler is honored by dispatch.
   */
  static _CHANGE_ACTIONS = {
    selectScene: 'handleSelectScene',
    updateSceneMood: 'handleUpdateSceneMood',
    updateSceneMoodTrack: 'handleUpdateSceneMoodTrack',
    updateSceneDefault: 'handleUpdateSceneDefault',
    updateSceneDefaultTrack: 'handleUpdateSceneDefaultTrack',
    updateGlobalMood: 'handleUpdateGlobalMood',
    updateGlobalMoodTrack: 'handleUpdateGlobalMoodTrack',
    updateGlobalDefault: 'handleUpdateGlobalDefault',
    updateGlobalDefaultTrack: 'handleUpdateGlobalDefaultTrack'
  };

  /**
   * Internal delegated change event listener for select inputs
   * @param {Event} event - The change event
   * @private
   */
  _onChangeInput(event) {
    const target = event.target;
    if (!target || target.tagName !== 'SELECT') return;
    const methodName = PlaylistTreeApp._CHANGE_ACTIONS[target.dataset.changeAction];
    const handler = methodName && PlaylistTreeApp[methodName];
    if (typeof handler === 'function') handler.call(this, event, target);
  }

  /**
   * Handle selecting a scene from the dropdown
   */
  static handleSelectScene(event, target) {
    const select = target.closest('select') || target;
    const instance = PlaylistTreeApp._resolveInstance(this);
    if (!instance) return;
    instance.selectedSceneId = select.value || 'global';
    instance.render(false);
  }

  /**
   * Resolve the active app instance from a static-handler call context
   * @param {*} context - `this` inside the calling static handler
   * @returns {PlaylistTreeApp|null}
   * @private
   */
  static _resolveInstance(context) {
    return game.vgmusic?.playlistTree || (context instanceof PlaylistTreeApp ? context : null);
  }

  /**
   * Build the flag/setting path for a music section, optionally scoped to a mood
   * @private
   */
  static _buildPath(contextType, moodId) {
    return moodId ? `music.${contextType}.moods.${moodId}` : `music.${contextType}`;
  }

  /**
   * Apply a playlist selection (or clear it, when playlistId is null) to a scene flag entry
   * @param {string} [trackIdOverride] - When provided, used verbatim instead of resolving
   *   from the existing/soundboard-default track (e.g. a specific track dragged onto the entry)
   * @private
   */
  static async _applySceneEntry(scene, path, playlistId, trackIdOverride = undefined) {
    if (playlistId) {
      const existingTrackId = scene.getFlag(CONST.moduleId, `${path}.initialTrack`) || null;
      const initialTrackId = trackIdOverride !== undefined ? trackIdOverride : resolveInitialTrack(playlistId, existingTrackId);
      await scene.setFlag(CONST.moduleId, `${path}.playlist`, playlistId);
      if (initialTrackId) await scene.setFlag(CONST.moduleId, `${path}.initialTrack`, initialTrackId);
    } else {
      await scene.unsetFlag(CONST.moduleId, `${path}.playlist`);
      await scene.unsetFlag(CONST.moduleId, `${path}.initialTrack`);
    }
  }

  /**
   * Apply a track selection (or clear it, when trackId is null) to a scene flag entry
   * @private
   */
  static async _applySceneTrack(scene, path, trackId) {
    if (trackId) await scene.setFlag(CONST.moduleId, `${path}.initialTrack`, trackId);
    else await scene.unsetFlag(CONST.moduleId, `${path}.initialTrack`);
  }

  /**
   * Apply a playlist selection (or clear it, when playlistId is null) to the global defaultMusic setting
   * @param {string} [trackIdOverride] - When provided, used verbatim instead of resolving
   *   from the existing/soundboard-default track (e.g. a specific track dragged onto the entry)
   * @private
   */
  static async _applyGlobalEntry(path, playlistId, trackIdOverride = undefined) {
    const prevConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const updateData = foundry.utils.deepClone(prevConfig);

    if (playlistId) {
      const existingTrackId = foundry.utils.getProperty(updateData, `data.vgmusic.${path}.initialTrack`) || null;
      const initialTrackId = trackIdOverride !== undefined ? trackIdOverride : resolveInitialTrack(playlistId, existingTrackId);
      foundry.utils.setProperty(updateData, `data.vgmusic.${path}.playlist`, playlistId);
      if (initialTrackId) foundry.utils.setProperty(updateData, `data.vgmusic.${path}.initialTrack`, initialTrackId);
    } else {
      const section = foundry.utils.getProperty(updateData, `data.vgmusic.${path}`);
      if (section) {
        delete section.playlist;
        delete section.initialTrack;
      }
    }

    await game.settings.set(CONST.moduleId, CONST.settings.defaultMusic, updateData);
  }

  /**
   * Apply a track selection (or clear it, when trackId is null) to the global defaultMusic setting
   * @private
   */
  static async _applyGlobalTrack(path, trackId) {
    const prevConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const updateData = foundry.utils.deepClone(prevConfig);

    if (trackId) {
      foundry.utils.setProperty(updateData, `data.vgmusic.${path}.initialTrack`, trackId);
    } else {
      const section = foundry.utils.getProperty(updateData, `data.vgmusic.${path}`);
      if (section) delete section.initialTrack;
    }

    await game.settings.set(CONST.moduleId, CONST.settings.defaultMusic, updateData);
  }

  /**
   * Handle updating scene mood playlist
   */
  static async handleUpdateSceneMood(event, target) {
    const select = target.closest('select') || target;
    const moodId = select.dataset.moodId;
    const contextType = select.dataset.contextType || 'area';
    const playlistId = select.value || null;

    const instance = PlaylistTreeApp._resolveInstance(this);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      await PlaylistTreeApp._applySceneEntry(scene, PlaylistTreeApp._buildPath(contextType, moodId), playlistId);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to update scene mood override:', error);
    }
  }

  /**
   * Handle updating scene mood track
   */
  static async handleUpdateSceneMoodTrack(event, target) {
    const select = target.closest('select') || target;
    const moodId = select.dataset.moodId;
    const contextType = select.dataset.contextType || 'area';
    const trackId = select.value || null;

    const instance = PlaylistTreeApp._resolveInstance(this);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      await PlaylistTreeApp._applySceneTrack(scene, PlaylistTreeApp._buildPath(contextType, moodId), trackId);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to update scene mood track:', error);
    }
  }

  /**
   * Handle clearing scene mood override
   */
  static async handleClearSceneMood(event, target) {
    event.preventDefault();
    const btn = target.closest('[data-mood-id]') || target;
    const moodId = btn.dataset.moodId;
    const contextType = btn.dataset.contextType || 'area';

    const instance = PlaylistTreeApp._resolveInstance(this);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      await PlaylistTreeApp._applySceneEntry(scene, PlaylistTreeApp._buildPath(contextType, moodId), null);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to clear scene mood override:', error);
    }
  }

  /**
   * Handle updating scene default playlist
   */
  static async handleUpdateSceneDefault(event, target) {
    const select = target.closest('select') || target;
    const contextType = select.dataset.contextType || 'area';
    const playlistId = select.value || null;

    const instance = PlaylistTreeApp._resolveInstance(this);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      await PlaylistTreeApp._applySceneEntry(scene, PlaylistTreeApp._buildPath(contextType, null), playlistId);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to update scene default override:', error);
    }
  }

  /**
   * Handle updating scene default track
   */
  static async handleUpdateSceneDefaultTrack(event, target) {
    const select = target.closest('select') || target;
    const contextType = select.dataset.contextType || 'area';
    const trackId = select.value || null;

    const instance = PlaylistTreeApp._resolveInstance(this);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      await PlaylistTreeApp._applySceneTrack(scene, PlaylistTreeApp._buildPath(contextType, null), trackId);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to update scene default track:', error);
    }
  }

  /**
   * Handle clearing scene default override
   */
  static async handleClearSceneDefault(event, target) {
    event.preventDefault();
    const btn = target.closest('[data-context-type]') || target;
    const contextType = btn.dataset.contextType || 'area';

    const instance = PlaylistTreeApp._resolveInstance(this);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      await PlaylistTreeApp._applySceneEntry(scene, PlaylistTreeApp._buildPath(contextType, null), null);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to clear scene default override:', error);
    }
  }

  /**
   * Handle updating global mood playlist
   */
  static async handleUpdateGlobalMood(event, target) {
    const select = target.closest('select') || target;
    const moodId = select.dataset.moodId;
    const contextType = select.dataset.contextType || 'area';
    const playlistId = select.value || null;

    const instance = PlaylistTreeApp._resolveInstance(this);

    try {
      await PlaylistTreeApp._applyGlobalEntry(PlaylistTreeApp._buildPath(contextType, moodId), playlistId);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to update global mood override:', error);
    }
  }

  /**
   * Handle updating global mood track
   */
  static async handleUpdateGlobalMoodTrack(event, target) {
    const select = target.closest('select') || target;
    const moodId = select.dataset.moodId;
    const contextType = select.dataset.contextType || 'area';
    const trackId = select.value || null;

    const instance = PlaylistTreeApp._resolveInstance(this);

    try {
      await PlaylistTreeApp._applyGlobalTrack(PlaylistTreeApp._buildPath(contextType, moodId), trackId);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to update global mood track:', error);
    }
  }

  /**
   * Handle clearing global mood override
   */
  static async handleClearGlobalMood(event, target) {
    event.preventDefault();
    const btn = target.closest('[data-mood-id]') || target;
    const moodId = btn.dataset.moodId;
    const contextType = btn.dataset.contextType || 'area';

    const instance = PlaylistTreeApp._resolveInstance(this);

    try {
      await PlaylistTreeApp._applyGlobalEntry(PlaylistTreeApp._buildPath(contextType, moodId), null);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to clear global mood override:', error);
    }
  }

  /**
   * Handle updating global default playlist
   */
  static async handleUpdateGlobalDefault(event, target) {
    const select = target.closest('select') || target;
    const contextType = select.dataset.contextType || 'area';
    const playlistId = select.value || null;

    const instance = PlaylistTreeApp._resolveInstance(this);

    try {
      await PlaylistTreeApp._applyGlobalEntry(PlaylistTreeApp._buildPath(contextType, null), playlistId);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to update global default override:', error);
    }
  }

  /**
   * Handle updating global default track
   */
  static async handleUpdateGlobalDefaultTrack(event, target) {
    const select = target.closest('select') || target;
    const contextType = select.dataset.contextType || 'area';
    const trackId = select.value || null;

    const instance = PlaylistTreeApp._resolveInstance(this);

    try {
      await PlaylistTreeApp._applyGlobalTrack(PlaylistTreeApp._buildPath(contextType, null), trackId);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to update global default track:', error);
    }
  }

  /**
   * Handle clearing global default override
   */
  static async handleClearGlobalDefault(event, target) {
    event.preventDefault();
    const btn = target.closest('[data-context-type]') || target;
    const contextType = btn.dataset.contextType || 'area';

    const instance = PlaylistTreeApp._resolveInstance(this);

    try {
      await PlaylistTreeApp._applyGlobalEntry(PlaylistTreeApp._buildPath(contextType, null), null);
      game.vgmusic?.musicController?.playCurrentTrack();
      instance?.render(false);
    } catch (error) {
      log(1, 'Failed to clear global default override:', error);
    }
  }

  /**
   * Handle opening the Mood Configurator dialog
   */
  static handleOpenMoodConfig(event, target) {
    event?.preventDefault?.();
    new MoodConfigApp().render(true);
  }

  /**
   * Handle toggling section collapse state
   */
  static handleToggleSection(event, target) {
    event?.preventDefault?.();
    const element = target.closest('[data-section]') || target;
    const sectionKey = element?.dataset?.section;
    if (!sectionKey) return;
    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    if (!instance) return;

    const defaultCollapsed = element.dataset.defaultCollapsed === 'true';
    const currentlyCollapsed = instance.expandedSections.has(sectionKey)
      ? false
      : instance.collapsedSections.has(sectionKey)
        ? true
        : defaultCollapsed;

    if (currentlyCollapsed) {
      instance.collapsedSections.delete(sectionKey);
      instance.expandedSections.add(sectionKey);
    } else {
      instance.expandedSections.delete(sectionKey);
      instance.collapsedSections.add(sectionKey);
    }
    instance.render(false);
  }

  /**
   * Toggle window visibility
   */
  static toggle() {
    if (!game.vgmusic) return;
    if (game.vgmusic.playlistTree && game.vgmusic.playlistTree.rendered) {
      game.vgmusic.playlistTree.close();
      game.vgmusic.playlistTree = null;
      return;
    }
    PlaylistTreeApp.open();
  }

  /**
   * Open window
   */
  static open(options = {}) {
    if (!game.vgmusic) return;
    if (game.vgmusic.playlistTree?.rendered) {
      game.vgmusic.playlistTree.render(true);
      return;
    }
    game.vgmusic.playlistTree = new PlaylistTreeApp(options);
    game.vgmusic.playlistTree.render(true);
  }
}
