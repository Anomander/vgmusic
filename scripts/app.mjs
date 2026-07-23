import { CONST } from './config.mjs';
import { getDocumentCategory, getProperty, log, getAvailablePlaylists, buildPlaylistEntry, resolveInitialTrack } from './helpers.mjs';

const _loc = (key) => game.i18n.localize(key);

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop } = foundry.applications.ux;

/**
 * Music configuration application
 */
export class VGMusicConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'vgmusic-config',
    tag: 'form',
    window: { title: 'VGMusic.ConfigTitle', icon: 'fas fa-music', resizable: true, minimizable: true },
    modal: true,
    classes: ['dnd5e2'],
    form: {
      handler: VGMusicConfig.formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    position: { width: 'auto', height: 'auto' },
    actions: {
      reset: VGMusicConfig.handleReset,
      openPlaylist: VGMusicConfig.openPlaylist,
      deletePlaylist: VGMusicConfig.deletePlaylist,
      selectMood: VGMusicConfig.selectMood,
      clearMoodEntry: VGMusicConfig.handleClearMoodEntry,
      clearDefaultEntry: VGMusicConfig.handleClearDefaultEntry,
      toggleSection: VGMusicConfig.handleToggleSection
    },
    dragDrop: [
      { dragSelector: '.playlist-section-item[data-reorderable="true"]', dropSelector: '.playlist-section-list', permissions: { dragstart: true, drop: true }, callbacks: {} },
      { dragSelector: null, dropSelector: '.playlist-section[data-section]', permissions: { dragstart: false, drop: true }, callbacks: {} }
    ]
  };

  /** @override */
  static PARTS = { form: { template: 'modules/vgmusic/templates/music-config.hbs' } };

  config = [];

  /**
   * Create a new configuration instance
   * @param {Scene|TokenDocument|PrototypeToken} object The Scene or Token/PrototypeToken document to configure
   * @param {object} [options] Additional application options
   */
  constructor(object, options = {}) {
    super(options);
    this.document = object;
    this.selectedMood = options.selectedMood || game.settings.get(CONST.moduleId, CONST.settings.activeMood) || '';
    this.expandedSections = new Set(options.expandedSections || []);
    this.collapsedSections = new Set(options.collapsedSections || []);
    if (game.vgmusic) game.vgmusic.configApp = this;
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    if (game.vgmusic?.configApp === this) {
      game.vgmusic.configApp = null;
    }
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
   * Handle selecting a mood tab
   */
  static selectMood(event, target) {
    event.preventDefault();
    this.selectedMood = target.dataset.mood || '';
    this.render(false);
  }

  /**
   * Maps `data-change-action` values to their handler method name. Looked up
   * dynamically on the class (rather than captured by reference) so that
   * spying/mocking a handler is honored by dispatch.
   */
  static _CHANGE_ACTIONS = {
    updateMoodEntry: 'handleUpdateMoodEntry',
    updateMoodTrack: 'handleUpdateMoodTrack',
    updateDefaultEntry: 'handleUpdateDefaultEntry',
    updateDefaultTrack: 'handleUpdateDefaultTrack'
  };

  /**
   * Internal delegated change event listener for the mood-grid select inputs
   * @param {Event} event - The change event
   * @private
   */
  _onChangeInput(event) {
    const target = event.target;
    if (!target || target.tagName !== 'SELECT' || !target.dataset.changeAction) return;
    const methodName = VGMusicConfig._CHANGE_ACTIONS[target.dataset.changeAction];
    const handler = methodName && VGMusicConfig[methodName];
    if (typeof handler === 'function') handler.call(this, event, target);
  }

  /**
   * Apply a playlist selection to a mood-grid entry, auto-resolving the initial
   * track for Soundboard playlists or carrying over an existing track selection
   * @param {string} path - Relative path under music., e.g. 'music.combat' or 'music.combat.moods.boss'
   * @param {string} playlistId - Selected playlist ID
   * @private
   */
  async _applyMoodGridEntry(path, playlistId) {
    const docData = getProperty(this.document, this.updateDataPrefix) || {};
    const existingTrackId = getProperty(docData, `${path}.initialTrack`) || null;
    const initialTrackId = resolveInitialTrack(playlistId, existingTrackId);
    const data = { [`${path}.playlist`]: playlistId };
    if (initialTrackId) data[`${path}.initialTrack`] = initialTrackId;
    await this.updateObject(data);
  }

  /**
   * Handle updating a mood-scoped combat playlist entry (token mood-grid layout)
   */
  static async handleUpdateMoodEntry(event, target) {
    const select = target.closest('select') || target;
    const moodId = select.dataset.moodId;
    const playlistId = select.value || null;
    try {
      if (playlistId) await this._applyMoodGridEntry(`music.combat.moods.${moodId}`, playlistId);
      else await this.updateObject({ [`music.combat.moods.-=${moodId}`]: null });
      game.vgmusic?.musicController?.playCurrentTrack();
    } catch (error) {
      log(1, 'Failed to update token mood override:', error);
    }
  }

  /**
   * Handle updating a mood-scoped combat track entry
   */
  static async handleUpdateMoodTrack(event, target) {
    const select = target.closest('select') || target;
    const moodId = select.dataset.moodId;
    const trackId = select.value || null;
    const path = `music.combat.moods.${moodId}`;
    try {
      if (trackId) await this.updateObject({ [`${path}.initialTrack`]: trackId });
      else await this.updateObject({ [`${path}.-=initialTrack`]: null });
      game.vgmusic?.musicController?.playCurrentTrack();
    } catch (error) {
      log(1, 'Failed to update token mood track:', error);
    }
  }

  /**
   * Handle clearing a mood-scoped combat override
   */
  static async handleClearMoodEntry(event, target) {
    event.preventDefault();
    const btn = target.closest('[data-mood-id]') || target;
    const moodId = btn.dataset.moodId;
    try {
      await this.updateObject({ [`music.combat.moods.-=${moodId}`]: null });
      game.vgmusic?.musicController?.playCurrentTrack();
    } catch (error) {
      log(1, 'Failed to clear token mood override:', error);
    }
  }

  /**
   * Handle updating the default (non-mood) combat playlist entry
   */
  static async handleUpdateDefaultEntry(event, target) {
    const select = target.closest('select') || target;
    const playlistId = select.value || null;
    try {
      if (playlistId) await this._applyMoodGridEntry('music.combat', playlistId);
      else await this.updateObject({ 'music.combat.-=playlist': null, 'music.combat.-=initialTrack': null, 'music.combat.-=priority': null });
      game.vgmusic?.musicController?.playCurrentTrack();
    } catch (error) {
      log(1, 'Failed to update token default override:', error);
    }
  }

  /**
   * Handle updating the default (non-mood) combat track entry
   */
  static async handleUpdateDefaultTrack(event, target) {
    const select = target.closest('select') || target;
    const trackId = select.value || null;
    try {
      if (trackId) await this.updateObject({ 'music.combat.initialTrack': trackId });
      else await this.updateObject({ 'music.combat.-=initialTrack': null });
      game.vgmusic?.musicController?.playCurrentTrack();
    } catch (error) {
      log(1, 'Failed to update token default track:', error);
    }
  }

  /**
   * Handle clearing the default (non-mood) combat override
   */
  static async handleClearDefaultEntry(event, target) {
    event.preventDefault();
    try {
      await this.updateObject({ 'music.combat.-=playlist': null, 'music.combat.-=initialTrack': null, 'music.combat.-=priority': null });
      game.vgmusic?.musicController?.playCurrentTrack();
    } catch (error) {
      log(1, 'Failed to clear token default override:', error);
    }
  }

  /**
   * Handle toggling mood-grid section/card collapse state
   */
  static handleToggleSection(event, target) {
    event?.preventDefault?.();
    const element = target.closest('[data-section]') || target;
    const sectionKey = element?.dataset?.section;
    if (!sectionKey) return;
    const instance = this instanceof VGMusicConfig ? this : game.vgmusic?.configApp;
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
   * Get the update data prefix based on document type
   * @returns {string} The prefix path for flag updates
   */
  get updateDataPrefix() {
    const category = getDocumentCategory(this.document);
    if (category === 'Document' || category === 'PrototypeToken') return 'flags.vgmusic';
    return 'data.vgmusic';
  }

  /**
   * Check if the configured object is a Document
   * @returns {boolean} True if document instance
   */
  get isDocument() {
    return getDocumentCategory(this.document) === 'Document';
  }

  /**
   * Get the document type name for playlist sections lookup
   * Handles both Documents and DataModels (like PrototypeToken)
   * @returns {string|undefined} The document type name
   */
  get documentTypeName() {
    if (this.document.documentName) return this.document.documentName;
    if (getDocumentCategory(this.document) === 'PrototypeToken') return 'Token';
    log(2, `VGMusicConfig.documentTypeName: Unknown document class name: ${this.document?.constructor?.name}`);
    return undefined;
  }

  /**
   * Whether this document type uses the mood-card-grid layout (all moods shown
   * as simultaneous cards, matching PlaylistTreeApp) instead of the tabbed form
   * @returns {boolean}
   */
  get isTokenMoodGrid() {
    return this.documentTypeName === 'Token';
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

  /**
   * Initialize the playlist configuration from document or defaults
   */
  initializeConfig() {
    try {
      const docType = this.documentTypeName;
      const sections = CONST.playlistSections[docType];
      if (!sections) {
        log(1, 'No sections found for document type:', docType);
        this.config = [];
        return;
      }
      const data = getProperty(this.document, this.updateDataPrefix) || {};
      const activeMood = this.selectedMood || '';
      this.config = Object.entries(sections).map(([key, sectionConfig]) => {
        const rawSection = getProperty(data, `music.${key}`) || {};
        const effectiveData = activeMood ? (rawSection.moods?.[activeMood] || {}) : rawSection;
        const playlistId = effectiveData.playlist;
        const playlist = playlistId ? game.playlists.get(playlistId) : null;
        const tracks =
          playlist?.playbackOrder?.reduce((obj, id) => {
            const track = playlist.sounds.get(id);
            if (track) obj[id] = track.name;
            return obj;
          }, {}) || {};
        return {
          id: key,
          label: sectionConfig.label,
          order: effectiveData.order || sectionConfig.priority || 0,
          enabled: !!playlist,
          playlist,
          tracks,
          data: effectiveData,
          allowPriority: true,
          sortable: true
        };
      });
      this.config.sort((a, b) => a.order - b.order);
    } catch (error) {
      log(1, 'Error initializing configuration:', error);
      this.config = [];
    }
  }

  /** @override */
  _prepareContext(_options) {
    this.initializeConfig();
    const playlistConfig = this.config.map((section, index) => ({ ...section, index, labelLocalized: _loc(section.label) }));
    const buttons = [
      { type: 'submit', icon: 'fas fa-save', label: 'VGMusic.UI.Save' },
      { type: 'button', action: 'reset', icon: 'fas fa-undo', label: 'VGMusic.UI.Reset' }
    ];
    const activeWorldMood = game.settings.get(CONST.moduleId, CONST.settings.activeMood) || '';
    const configuredMoods = game.settings.get(CONST.moduleId, CONST.settings.configuredMoods) || CONST.defaultMoods;
    const docData = getProperty(this.document, this.updateDataPrefix) || {};
    const availableMoods = configuredMoods.map((m) => {
      let hasOverride = false;
      if (docData.music) {
        for (const secKey of Object.keys(docData.music)) {
          if (docData.music[secKey]?.moods?.[m.id]?.playlist) {
            hasOverride = true;
            break;
          }
        }
      }
      return {
        ...m,
        isActive: m.id === (this.selectedMood || ''),
        isWorldActive: m.id === activeWorldMood,
        hasOverride
      };
    });
    const context = {
      playlistConfig,
      buttons,
      documentType: this.documentTypeName,
      availableMoods,
      selectedMood: this.selectedMood || '',
      activeWorldMood,
      isTokenMoodGrid: this.isTokenMoodGrid
    };
    if (this.isTokenMoodGrid) Object.assign(context, this._prepareMoodGridContext(docData, configuredMoods, activeWorldMood));
    return context;
  }

  /**
   * Build mood-card-grid context data for Token/PrototypeToken documents,
   * mirroring PlaylistTreeApp's scene mood-grid + scene-defaults structure
   * (Token only has a Combat section, so each card holds a single context box)
   * @param {object} docData - This document's vgmusic flags/data namespace
   * @param {Array} configuredMoods - World-configured moods
   * @param {string} activeWorldMood - Currently active world mood ID
   * @returns {object} Context fragment: availablePlaylists, moodCards, defaultEntry, moodsResolving, defaultResolving, collapsed
   * @private
   */
  _prepareMoodGridContext(docData, configuredMoods, activeWorldMood) {
    const availablePlaylists = getAvailablePlaylists();
    const combatSection = docData.music?.combat || {};

    const currentControllerContext = game.vgmusic?.musicController?.currentContext || null;
    const winningEntity = currentControllerContext?.contextEntity;
    const winningIsMood = currentControllerContext?.isMood ?? false;

    const moodCards = configuredMoods.map((m) => {
      const playlistId = combatSection.moods?.[m.id]?.playlist || null;
      const trackId = combatSection.moods?.[m.id]?.initialTrack || null;
      const hasOverride = !!playlistId;
      const isResolving = winningEntity === this.document && winningIsMood && activeWorldMood === m.id;
      const cardKey = `tokenMood:${m.id}`;
      const isCardCollapsed = this.isSectionCollapsed(cardKey, hasOverride);

      return {
        moodId: m.id,
        label: m.label,
        icon: m.icon,
        color: m.color,
        combat: buildPlaylistEntry(availablePlaylists, playlistId, trackId),
        isActive: activeWorldMood === m.id,
        isResolving,
        hasOverride,
        isCardCollapsed,
        cardKey
      };
    });

    const defaultEntry = { combat: buildPlaylistEntry(availablePlaylists, combatSection.playlist || null, combatSection.initialTrack || null) };

    const moodsResolving = winningEntity === this.document && winningIsMood;
    const defaultResolving = winningEntity === this.document && !winningIsMood;

    const hasMoodsOverride = moodCards.some((m) => m.hasOverride);
    const hasDefaultOverride = !!defaultEntry.combat.playlistId;

    const collapsed = {
      moods: this.isSectionCollapsed('tokenMoods', hasMoodsOverride),
      default: this.isSectionCollapsed('tokenDefault', hasDefaultOverride)
    };

    return { availablePlaylists, moodCards, defaultEntry, moodsResolving, defaultResolving, collapsed };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.setDraggableAttributes();
    this.setupDragDrop();
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
  }

  /**
   * Set up drag and drop handlers for both reordering and external drops
   */
  setupDragDrop() {
    const dragDropConfigs = this.options.dragDrop || VGMusicConfig.DEFAULT_OPTIONS.dragDrop || [];
    dragDropConfigs.forEach((dragDropOptions, index) => {
      if (index === 0) {
        dragDropOptions.callbacks = {
          dragstart: this.onDragStart.bind(this),
          dragover: this.onDragOver.bind(this),
          drop: this.onDropReorder.bind(this)
        };
      } else {
        dragDropOptions.callbacks = {
          dragover: this.onDragOverExternal.bind(this),
          drop: this.onDropExternal.bind(this)
        };
      }
      const dragDropHandler = new DragDrop(dragDropOptions);
      dragDropHandler.bind(this.element);
    });
  }

  /**
   * Set draggable attributes on playlist items
   */
  setDraggableAttributes() {
    const items = this.element.querySelectorAll('.playlist-section-item');
    items.forEach((item, index) => {
      const section = this.config[index];
      const isSortable = section?.sortable !== false;
      item.setAttribute('draggable', isSortable ? 'true' : 'false');
      item.setAttribute('data-reorderable', isSortable ? 'true' : 'false');
    });
  }

  /**
   * Handle drag start event for internal reordering
   * @param {DragEvent} event - The drag event
   * @returns {boolean} Whether drag started successfully
   */
  onDragStart(event) {
    try {
      const li = event.currentTarget.closest('li');
      if (!li || li.classList.contains('not-sortable')) {
        log(1, 'Drag start blocked - not sortable');
        return false;
      }
      this._formState = this._captureFormState();
      const sectionIndex = li.dataset.index;
      const dragData = { type: 'playlist-config-reorder', index: sectionIndex };
      event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
      li.classList.add('dragging');
      return true;
    } catch (error) {
      log(1, 'Error starting drag:', error);
      return false;
    }
  }

  /**
   * Handle drag over event for internal reordering
   * @param {DragEvent} event - The drag event
   */
  onDragOver(event) {
    event.preventDefault();
    const list = this.element.querySelector('.playlist-section-list');
    if (!list) {
      log(2, 'No playlist section list found');
      return;
    }
    const draggingItem = list.querySelector('.dragging');
    if (!draggingItem) return;
    const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
    if (!items.length) return;
    const targetItem = this.getDragTarget(event, items);
    if (!targetItem) return;
    const rect = targetItem.getBoundingClientRect();
    const dropAfter = event.clientY > rect.top + rect.height / 2;
    this.removeDropPlaceholders();
    this.createDropPlaceholder(targetItem, dropAfter);
  }

  /**
   * Handle drag over event for external drops
   * @param {DragEvent} event - The drag event
   */
  onDragOverExternal(event) {
    event.preventDefault();
    const hasExternalData = event.dataTransfer.types.includes('text/plain');
    if (hasExternalData) event.currentTarget.classList.add('drop-hover');
  }

  /**
   * Clear hover feedback once a drag genuinely leaves a drop target (as opposed
   * to moving between its child elements, which also fires dragleave on it)
   * @param {DragEvent} event
   * @private
   */
  _onDragLeaveExternal(event) {
    const box = event.target.closest?.('.playlist-section[data-section]');
    if (!box) return;
    if (event.relatedTarget && box.contains(event.relatedTarget)) return;
    box.classList.remove('drop-hover');
  }

  /**
   * Find the target element for dropping
   * @param {DragEvent} event - The drag event
   * @param {HTMLElement[]} items - List of potential drop targets
   * @returns {HTMLElement|null} The closest drop target element
   */
  getDragTarget(event, items) {
    try {
      return (
        items.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = event.clientY - (box.top + box.height / 2);
          if (closest === null || Math.abs(offset) < Math.abs(closest.offset)) return { element: child, offset: offset };
          else return closest;
        }, null)?.element || null
      );
    } catch (error) {
      log(1, 'Error finding drag target:', error);
      return null;
    }
  }

  /**
   * Handle drop event for internal reordering
   * @param {DragEvent} event - The drop event
   * @returns {Promise<boolean>} Whether drop was handled successfully
   */
  async onDropReorder(event) {
    try {
      event.preventDefault();
      const dataString = event.dataTransfer.getData('text/plain');
      if (!dataString) {
        log(2, 'Failed to reorder sections: empty drag data');
        return false;
      }
      const data = JSON.parse(dataString);
      if (!data || data.type !== 'playlist-config-reorder') {
        log(2, 'Failed to reorder sections: invalid drag data type');
        return false;
      }
      const sourceIndex = parseInt(data.index);
      if (isNaN(sourceIndex)) {
        log(2, `Failed to reorder sections: invalid source index '${data.index}'`);
        return false;
      }
      const list = this.element.querySelector('.playlist-section-list');
      const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
      const targetItem = this.getDragTarget(event, items);
      if (!targetItem) {
        log(2, 'Failed to reorder sections: no valid drag target found');
        return false;
      }
      const targetIndex = parseInt(targetItem.dataset.index);
      if (isNaN(targetIndex)) {
        log(2, `Failed to reorder sections: invalid target index '${targetItem.dataset.index}'`);
        return false;
      }
      const rect = targetItem.getBoundingClientRect();
      const dropAfter = event.clientY > rect.top + rect.height / 2;
      let newIndex = dropAfter ? targetIndex + 1 : targetIndex;
      if (sourceIndex < newIndex) newIndex--;
      const [movedItem] = this.config.splice(sourceIndex, 1);
      this.config.splice(newIndex, 0, movedItem);
      this.updatePlaylistOrder();
      if (this._formState) for (const section of this.config) if (section.id in this._formState) section.enabled = this._formState[section.id];
      this.render(false);
      log(3, `Successfully reordered sections: moved index ${sourceIndex} to index ${newIndex}`);
      return true;
    } catch (error) {
      log(1, 'Error handling reorder drop:', error);
      return false;
    } finally {
      this.cleanupDragElements();
      delete this._formState;
    }
  }

  /**
   * Handle drop event for external playlist/sound drops
   * @param {DragEvent} event - The drop event
   * @returns {Promise<boolean>} Whether drop was handled successfully
   */
  async onDropExternal(event) {
    try {
      event.preventDefault();
      this.element.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));
      const dataString = event.dataTransfer.getData('text/plain');
      if (!dataString) {
        log(2, 'Failed to handle external drop: empty drag data');
        return false;
      }
      let data;
      try {
        data = JSON.parse(dataString);
      } catch (e) {
        log(1, 'Failed to parse drag data:', e);
        return false;
      }
      if (data.type === 'playlist-config-reorder') return false;
      if (!['Playlist', 'PlaylistSound'].includes(data.type) || !data.uuid) {
        log(2, `Failed to handle external drop: invalid document type '${data.type}'`);
        return false;
      }
      const section = event.currentTarget.dataset.section;
      if (!section) {
        log(2, 'Failed to handle external drop: section data not found on drop target');
        return false;
      }
      const document = await fromUuid(data.uuid);
      if (!document) {
        log(2, `Failed to handle external drop: document with UUID '${data.uuid}' not found`);
        return false;
      }
      let playlist, sound;
      if (document instanceof PlaylistSound) {
        playlist = document.parent;
        sound = document;
      } else if (document instanceof Playlist) {
        playlist = document;
      } else {
        log(2, `Failed to handle external drop: resolved document is not a Playlist or PlaylistSound`);
        return false;
      }
      const sectionConfig = CONST.playlistSections[this.documentTypeName][section];
      if (!sectionConfig) {
        log(2, `Failed to handle external drop: no section configuration found for '${section}'`);
        return false;
      }
      const targetMood = event.currentTarget.dataset.moodId !== undefined ? event.currentTarget.dataset.moodId : this.selectedMood || '';
      const moodPath = targetMood ? `music.${section}.moods.${targetMood}` : `music.${section}`;
      const currentData = getProperty(this.document, this.updateDataPrefix) || {};
      const existingTrackId = getProperty(currentData, `${moodPath}.initialTrack`) || null;
      const initialTrackId = sound ? sound.id : resolveInitialTrack(playlist.id, existingTrackId);
      const updateData = { [`${moodPath}.playlist`]: playlist.id };
      if (initialTrackId) updateData[`${moodPath}.initialTrack`] = initialTrackId;
      const prevData = getProperty(currentData, moodPath);
      if (!prevData?.priority) updateData[`${moodPath}.priority`] = sectionConfig.priority;
      await this.updateObject(updateData);
      log(3, `Successfully handled external drop: assigned playlist '${playlist.name}' (track: '${initialTrackId || 'none'}') to section '${section}' (mood: '${targetMood || 'default'}')`);
      return true;
    } catch (error) {
      log(1, 'Error handling external drop:', error);
      return false;
    }
  }

  /**
   * Update playlist order values after reordering
   */
  updatePlaylistOrder() {
    this.config.forEach((section, idx) => {
      section.order = (idx + 1) * 10;
    });
  }

  /**
   * Create a visual placeholder for drop position
   * @param {HTMLElement} targetItem - The target element to place placeholder near
   * @param {boolean} dropAfter - Whether to place placeholder after target
   */
  createDropPlaceholder(targetItem, dropAfter) {
    const placeholder = document.createElement('div');
    placeholder.classList.add('drop-placeholder');
    if (dropAfter) targetItem.after(placeholder);
    else targetItem.before(placeholder);
  }

  /**
   * Remove all drop placeholders
   */
  removeDropPlaceholders() {
    const placeholders = this.element.querySelectorAll('.drop-placeholder');
    placeholders.forEach((el) => el.remove());
  }

  /**
   * Clean up visual elements after dragging
   */
  cleanupDragElements() {
    const draggingItems = this.element.querySelectorAll('.dragging');
    draggingItems.forEach((el) => el.classList.remove('dragging'));
    this.removeDropPlaceholders();
    const dropHoverItems = this.element.querySelectorAll('.drop-hover');
    dropHoverItems.forEach((el) => el.classList.remove('drop-hover'));
  }

  /**
   * Capture current form state for playlist enablement
   * @returns {object} Form state object
   */
  _captureFormState() {
    const state = {};
    const checkboxes = this.element.querySelectorAll('input[type="checkbox"][name^="enabled-"]');
    checkboxes.forEach((checkbox) => {
      const sectionId = checkbox.name.replace('enabled-', '');
      state[sectionId] = checkbox.checked;
    });
    return state;
  }

  /**
   * Update the document with new data
   * @param {object} data - The data to update
   * @returns {Promise<void>} Resolves when update completes
   */
  async updateObject(data) {
    const expandedData = Object.entries(data).reduce((acc, [key, value]) => {
      acc[`${this.updateDataPrefix}.${key}`] = value;
      return acc;
    }, {});
    if (this.isDocument) {
      const result = await this.document.update(expandedData);
      this.render(false);
      return result;
    }
    if (this.document.constructor.name === 'PrototypeToken') {
      const actor = this.document.parent;
      if (!actor) return;
      const prototypeData = Object.entries(data).reduce((acc, [key, value]) => {
        acc[`prototypeToken.flags.vgmusic.${key}`] = value;
        return acc;
      }, {});
      const result = await actor.update(prototypeData);
      this.document = actor.prototypeToken;
      this.render(false);
      return result;
    }
  }

  /**
   * Handle reset action
   * @param {Event} event - The click event
   * @param {HTMLFormElement} _form - The form element
   */
  static handleReset(event, _form) {
    event.preventDefault();
    this.initializeConfig();
    this.render(false);
  }

  /**
   * Open playlist sheet action
   * @param {Event} _event - The click event
   * @param {HTMLElement} target - The target element
   */
  static async openPlaylist(_event, target) {
    const playlistId = target.closest('.playlist-section').dataset.itemId;
    const playlist = game.playlists.get(playlistId);
    if (playlist) playlist.sheet.render(true);
  }

  /**
   * Delete playlist action
   * @param {Event} _event - The click event
   * @param {HTMLElement} target - The target element
   */
  static async deletePlaylist(_event, target) {
    const section = target.closest('.playlist-section').dataset.section;
    const moodId = this.selectedMood || '';
    try {
      if (moodId) {
        await this.updateObject({ [`music.${section}.moods.-=${moodId}`]: null });
        log(3, `Successfully deleted playlist override for mood '${moodId}', section '${section}'`);
      } else {
        await this.updateObject({ [`music.-=${section}`]: null });
        log(3, `Successfully deleted default playlist configuration override for section '${section}'`);
      }
    } catch (error) {
      log(1, `Failed to delete playlist configuration override for section '${section}':`, error);
    }
  }

  /**
   * Handle form submission
   * @param {Event} _event - The submit event
   * @param {HTMLFormElement} _form - The form element
   * @param {object} formData - The form data
   * @returns {Promise<boolean>} Whether submission succeeded
   * @override
   */
  static async formHandler(_event, _form, formData) {
    const updateData = Object.fromEntries(Object.entries(formData.object).filter(([key]) => key.startsWith('music.')));
    if (Object.keys(updateData).length > 0) {
      // Validate Soundboard playlists
      for (const key of Object.keys(updateData)) {
        if (key.endsWith('.playlist')) {
          const playlistId = updateData[key];
          const trackKey = key.replace(/\.playlist$/, '.initialTrack');
          const trackId = updateData[trackKey];
          if (playlistId) {
            const playlist = game.playlists.get(playlistId);
            const unsequencedMode = globalThis.CONST?.PLAYLIST_MODES?.UNSEQUENCED ?? -1;
            if (playlist && playlist.mode === unsequencedMode && !trackId) {
              const firstTrack = playlist.sounds.contents[0] || Array.from(playlist.sounds.values())[0];
              if (firstTrack) updateData[trackKey] = firstTrack.id;
            }
          }
        }
      }
      try {
        log(3, 'Saving VGMusic configuration updates:', updateData);
        await this.updateObject(updateData);
        game.vgmusic?.musicController?.playCurrentTrack();
        log(3, 'Successfully saved VGMusic configuration updates.');
        this.close();
      } catch (error) {
        log(1, 'Error updating data:', error);
        ui.notifications.error('Failed to save music configuration');
        return false;
      }
    } else {
      log(3, 'Form submitted with no updates.');
      this.close();
    }
    return true;
  }
}
