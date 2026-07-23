import { CONST } from './config.mjs';
import { log } from './helpers.mjs';
import { MoodConfigApp } from './mood-config.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
      clearGlobalDefaultTrack: PlaylistTreeApp.handleUpdateGlobalDefaultTrack,
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
    const unsequencedMode = globalThis.CONST?.PLAYLIST_MODES?.UNSEQUENCED ?? -1;
    const playlistsMap = new Map();

    const availablePlaylists = (game.playlists?.contents || Array.from(game.playlists || [])).map((p) => {
      const tracks = (p.sounds?.contents || Array.from(p.sounds?.values() || [])).map((s) => ({
        id: s.id,
        name: s.name
      }));
      const isSoundboard = p.mode === unsequencedMode;
      const item = { id: p.id, name: p.name, isSoundboard, tracks };
      playlistsMap.set(p.id, item);
      return item;
    });

    const buildEntry = (playlistId, trackId) => {
      const pl = playlistId ? playlistsMap.get(playlistId) : null;
      const isSoundboard = pl?.isSoundboard ?? false;
      const tracks = pl?.tracks || [];
      let effectiveTrackId = trackId || null;
      if (isSoundboard && !effectiveTrackId && tracks.length > 0) {
        effectiveTrackId = tracks[0].id;
      }
      return {
        playlistId: playlistId || null,
        initialTrackId: effectiveTrackId,
        isSoundboard,
        tracks
      };
    };

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
    this.element?.addEventListener('change', (event) => this._onChangeInput(event));
  }

  /**
   * Internal delegated change event listener for select inputs
   * @param {Event} event - The change event
   * @private
   */
  _onChangeInput(event) {
    const target = event.target;
    if (!target || target.tagName !== 'SELECT') return;
    const action = target.dataset.changeAction;
    if (action === 'selectScene') {
      PlaylistTreeApp.handleSelectScene.call(this, event, target);
    } else if (action === 'updateSceneMood') {
      PlaylistTreeApp.handleUpdateSceneMood.call(this, event, target);
    } else if (action === 'updateSceneMoodTrack') {
      PlaylistTreeApp.handleUpdateSceneMoodTrack.call(this, event, target);
    } else if (action === 'updateSceneDefault') {
      PlaylistTreeApp.handleUpdateSceneDefault.call(this, event, target);
    } else if (action === 'updateSceneDefaultTrack') {
      PlaylistTreeApp.handleUpdateSceneDefaultTrack.call(this, event, target);
    } else if (action === 'updateGlobalMood') {
      PlaylistTreeApp.handleUpdateGlobalMood.call(this, event, target);
    } else if (action === 'updateGlobalMoodTrack') {
      PlaylistTreeApp.handleUpdateGlobalMoodTrack.call(this, event, target);
    } else if (action === 'updateGlobalDefault') {
      PlaylistTreeApp.handleUpdateGlobalDefault.call(this, event, target);
    } else if (action === 'updateGlobalDefaultTrack') {
      PlaylistTreeApp.handleUpdateGlobalDefaultTrack.call(this, event, target);
    }
  }

  /**
   * Handle selecting a scene from the dropdown
   */
  static handleSelectScene(event, target) {
    const select = target.closest('select') || target;
    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    if (!instance) return;
    instance.selectedSceneId = select.value || 'global';
    instance.render(false);
  }

  /**
   * Helper to safely fetch a playlist from game.playlists
   */
  static _getPlaylist(playlistId) {
    if (!playlistId || !game.playlists) return null;
    if (typeof game.playlists.get === 'function') return game.playlists.get(playlistId);
    const list = game.playlists.contents || Array.from(game.playlists);
    return list.find((p) => p.id === playlistId) || null;
  }

  /**
   * Handle updating scene mood playlist
   */
  static async handleUpdateSceneMood(event, target) {
    const select = target.closest('select') || target;
    const moodId = select.dataset.moodId;
    const contextType = select.dataset.contextType || 'area';
    const playlistId = select.value || null;

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      if (playlistId) {
        const playlist = PlaylistTreeApp._getPlaylist(playlistId);
        const unsequencedMode = globalThis.CONST?.PLAYLIST_MODES?.UNSEQUENCED ?? -1;
        let initialTrackId = scene.getFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.initialTrack`) || null;

        if (playlist?.mode === unsequencedMode && !initialTrackId) {
          const firstTrack = (playlist.sounds?.contents || Array.from(playlist.sounds?.values() || []))[0];
          if (firstTrack) initialTrackId = firstTrack.id;
        }

        await scene.setFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.playlist`, playlistId);
        if (initialTrackId) {
          await scene.setFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.initialTrack`, initialTrackId);
        }
      } else {
        await scene.unsetFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.playlist`);
        await scene.unsetFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.initialTrack`);
      }
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      if (trackId) {
        await scene.setFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.initialTrack`, trackId);
      } else {
        await scene.unsetFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.initialTrack`);
      }
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      await scene.unsetFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.playlist`);
      await scene.unsetFlag(CONST.moduleId, `music.${contextType}.moods.${moodId}.initialTrack`);
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      if (playlistId) {
        const playlist = PlaylistTreeApp._getPlaylist(playlistId);
        const unsequencedMode = globalThis.CONST?.PLAYLIST_MODES?.UNSEQUENCED ?? -1;
        let initialTrackId = scene.getFlag(CONST.moduleId, `music.${contextType}.initialTrack`) || null;

        if (playlist?.mode === unsequencedMode && !initialTrackId) {
          const firstTrack = (playlist.sounds?.contents || Array.from(playlist.sounds?.values() || []))[0];
          if (firstTrack) initialTrackId = firstTrack.id;
        }

        await scene.setFlag(CONST.moduleId, `music.${contextType}.playlist`, playlistId);
        if (initialTrackId) {
          await scene.setFlag(CONST.moduleId, `music.${contextType}.initialTrack`, initialTrackId);
        }
      } else {
        await scene.unsetFlag(CONST.moduleId, `music.${contextType}.playlist`);
        await scene.unsetFlag(CONST.moduleId, `music.${contextType}.initialTrack`);
      }
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      if (trackId) {
        await scene.setFlag(CONST.moduleId, `music.${contextType}.initialTrack`, trackId);
      } else {
        await scene.unsetFlag(CONST.moduleId, `music.${contextType}.initialTrack`);
      }
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const scene = game.scenes?.get(instance?.selectedSceneId);
    if (!scene) return;

    try {
      await scene.unsetFlag(CONST.moduleId, `music.${contextType}.playlist`);
      await scene.unsetFlag(CONST.moduleId, `music.${contextType}.initialTrack`);
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const prevConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const updateData = foundry.utils.deepClone(prevConfig);

    if (playlistId) {
      const playlist = PlaylistTreeApp._getPlaylist(playlistId);
      const unsequencedMode = globalThis.CONST?.PLAYLIST_MODES?.UNSEQUENCED ?? -1;
      let initialTrackId = updateData.data?.vgmusic?.music?.[contextType]?.moods?.[moodId]?.initialTrack || null;

      if (playlist?.mode === unsequencedMode && !initialTrackId) {
        const firstTrack = (playlist.sounds?.contents || Array.from(playlist.sounds?.values() || []))[0];
        if (firstTrack) initialTrackId = firstTrack.id;
      }

      foundry.utils.setProperty(updateData, `data.vgmusic.music.${contextType}.moods.${moodId}.playlist`, playlistId);
      if (initialTrackId) {
        foundry.utils.setProperty(updateData, `data.vgmusic.music.${contextType}.moods.${moodId}.initialTrack`, initialTrackId);
      }
    } else {
      if (updateData.data?.vgmusic?.music?.[contextType]?.moods?.[moodId]) {
        delete updateData.data.vgmusic.music[contextType].moods[moodId].playlist;
        delete updateData.data.vgmusic.music[contextType].moods[moodId].initialTrack;
      }
    }

    try {
      await game.settings.set(CONST.moduleId, CONST.settings.defaultMusic, updateData);
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const prevConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const updateData = foundry.utils.deepClone(prevConfig);

    if (trackId) {
      foundry.utils.setProperty(updateData, `data.vgmusic.music.${contextType}.moods.${moodId}.initialTrack`, trackId);
    } else {
      if (updateData.data?.vgmusic?.music?.[contextType]?.moods?.[moodId]) {
        delete updateData.data.vgmusic.music[contextType].moods[moodId].initialTrack;
      }
    }

    try {
      await game.settings.set(CONST.moduleId, CONST.settings.defaultMusic, updateData);
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const prevConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const updateData = foundry.utils.deepClone(prevConfig);

    if (updateData.data?.vgmusic?.music?.[contextType]?.moods?.[moodId]) {
      delete updateData.data.vgmusic.music[contextType].moods[moodId].playlist;
      delete updateData.data.vgmusic.music[contextType].moods[moodId].initialTrack;
    }

    try {
      await game.settings.set(CONST.moduleId, CONST.settings.defaultMusic, updateData);
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const prevConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const updateData = foundry.utils.deepClone(prevConfig);

    if (playlistId) {
      const playlist = PlaylistTreeApp._getPlaylist(playlistId);
      const unsequencedMode = globalThis.CONST?.PLAYLIST_MODES?.UNSEQUENCED ?? -1;
      let initialTrackId = updateData.data?.vgmusic?.music?.[contextType]?.initialTrack || null;

      if (playlist?.mode === unsequencedMode && !initialTrackId) {
        const firstTrack = (playlist.sounds?.contents || Array.from(playlist.sounds?.values() || []))[0];
        if (firstTrack) initialTrackId = firstTrack.id;
      }

      foundry.utils.setProperty(updateData, `data.vgmusic.music.${contextType}.playlist`, playlistId);
      if (initialTrackId) {
        foundry.utils.setProperty(updateData, `data.vgmusic.music.${contextType}.initialTrack`, initialTrackId);
      }
    } else {
      if (updateData.data?.vgmusic?.music?.[contextType]) {
        delete updateData.data.vgmusic.music[contextType].playlist;
        delete updateData.data.vgmusic.music[contextType].initialTrack;
      }
    }

    try {
      await game.settings.set(CONST.moduleId, CONST.settings.defaultMusic, updateData);
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const prevConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const updateData = foundry.utils.deepClone(prevConfig);

    if (trackId) {
      foundry.utils.setProperty(updateData, `data.vgmusic.music.${contextType}.initialTrack`, trackId);
    } else {
      if (updateData.data?.vgmusic?.music?.[contextType]) {
        delete updateData.data.vgmusic.music[contextType].initialTrack;
      }
    }

    try {
      await game.settings.set(CONST.moduleId, CONST.settings.defaultMusic, updateData);
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

    const instance = game.vgmusic?.playlistTree || (this instanceof PlaylistTreeApp ? this : null);
    const prevConfig = game.settings.get(CONST.moduleId, CONST.settings.defaultMusic) || {};
    const updateData = foundry.utils.deepClone(prevConfig);

    if (updateData.data?.vgmusic?.music?.[contextType]) {
      delete updateData.data.vgmusic.music[contextType].playlist;
      delete updateData.data.vgmusic.music[contextType].initialTrack;
    }

    try {
      await game.settings.set(CONST.moduleId, CONST.settings.defaultMusic, updateData);
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
